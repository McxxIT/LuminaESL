import type { FastifyPluginAsync } from "fastify";
import { and, asc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  activity,
  creditEntries,
  lessons,
  slotOpenings,
  users,
} from "../db/schema";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unprocessable,
} from "../lib/errors";
import { managerOwnsStudent, managerOwnsTeacher, managerTeam } from "../lib/scope";
import { addMinutes, isValidClockTime, LESSON_MINUTES } from "../lib/time";

const idParams = z.object({ id: z.string().uuid() });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z
  .string()
  .refine(isValidClockTime, "Time must be in HH:MM 24-hour format");

const slotQuerySchema = z.object({
  teacherId: z.string().uuid().optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

const createSlotSchema = z.object({
  teacherId: z.string().uuid().optional(),
  date: dateSchema,
  time: timeSchema,
});

const bookSchema = z.object({
  slotId: z.string().uuid(),
  studentId: z.string().uuid().optional(),
});

export const bookingRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/slots",
    { preHandler: app.authenticate },
    async (request) => {
      const query = slotQuerySchema.parse(request.query);
      const conditions: SQL[] = [];
      if (query.teacherId) {
        conditions.push(eq(slotOpenings.teacherId, query.teacherId));
      }
      if (query.from) conditions.push(gte(slotOpenings.date, query.from));
      if (query.to) conditions.push(lte(slotOpenings.date, query.to));

      if (request.user.role === "manager") {
        const team = await managerTeam(app.db, request.user.sub);
        conditions.push(
          team.teacherIds.length
            ? inArray(slotOpenings.teacherId, team.teacherIds)
            : sql`false`,
        );
      }

      const where = conditions.length ? and(...conditions) : undefined;

      return app.db
        .select()
        .from(slotOpenings)
        .where(where)
        .orderBy(asc(slotOpenings.date), asc(slotOpenings.time));
    },
  );

  app.post(
    "/slots",
    { preHandler: app.requireRole(["admin", "manager", "teacher"]) },
    async (request, reply) => {
      const body = createSlotSchema.parse(request.body);
      const teacherId =
        request.user.role === "teacher"
          ? request.user.sub
          : body.teacherId;
      if (!teacherId) throw badRequest("teacherId is required");
      if (
        request.user.role === "manager" &&
        !(await managerOwnsTeacher(app.db, request.user.sub, teacherId))
      ) {
        throw forbidden("This teacher is not on your team");
      }

      const [existing] = await app.db
        .select({ id: slotOpenings.id })
        .from(slotOpenings)
        .where(
          and(
            eq(slotOpenings.teacherId, teacherId),
            eq(slotOpenings.date, body.date),
            eq(slotOpenings.time, body.time),
          ),
        )
        .limit(1);
      if (existing) {
        throw conflict("A slot is already open for that teacher and time");
      }

      const [slot] = await app.db
        .insert(slotOpenings)
        .values({
          teacherId,
          date: body.date,
          time: body.time,
          openedBy: request.user.sub,
        })
        .returning();
      if (!slot) throw new Error("Failed to open slot");

      reply.status(201);
      return slot;
    },
  );

  app.delete(
    "/slots/:id",
    { preHandler: app.authenticate },
    async (request) => {
      const { id } = idParams.parse(request.params);

      const [slot] = await app.db
        .select()
        .from(slotOpenings)
        .where(eq(slotOpenings.id, id))
        .limit(1);
      if (!slot) throw notFound("Slot not found");

      const canClose =
        request.user.role === "admin" ||
        (request.user.role === "manager" &&
          (await managerOwnsTeacher(app.db, request.user.sub, slot.teacherId))) ||
        slot.teacherId === request.user.sub;
      if (!canClose) throw forbidden();

      await app.db.delete(slotOpenings).where(eq(slotOpenings.id, id));
      return { id, deleted: true };
    },
  );

  app.post(
    "/",
    { preHandler: app.requireRole(["admin", "manager", "student"]) },
    async (request, reply) => {
      const body = bookSchema.parse(request.body);
      const studentId =
        request.user.role === "student"
          ? request.user.sub
          : body.studentId;
      if (!studentId) throw badRequest("studentId is required");

      const [student] = await app.db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, studentId))
        .limit(1);
      if (!student || student.role !== "student") {
        throw badRequest("studentId must belong to a student");
      }
      if (
        request.user.role === "manager" &&
        !(await managerOwnsStudent(app.db, request.user.sub, studentId))
      ) {
        throw forbidden("This student is not on your team");
      }

      const result = await app.db.transaction(async (tx) => {
        const [slot] = await tx
          .select()
          .from(slotOpenings)
          .where(eq(slotOpenings.id, body.slotId))
          .limit(1);
        if (!slot) throw notFound("Slot not found");

        const [balanceRow] = await tx
          .select({
            value: sql<number>`coalesce(sum(${creditEntries.hours}), 0)::numeric`,
          })
          .from(creditEntries)
          .where(eq(creditEntries.studentId, studentId));
        const balance = balanceRow?.value ?? 0;
        if (balance < 1) {
          throw unprocessable("Student does not have enough lesson credits");
        }

        const [claimed] = await tx
          .delete(slotOpenings)
          .where(eq(slotOpenings.id, body.slotId))
          .returning();
        if (!claimed) throw conflict("That slot was just taken");

        const [lesson] = await tx
          .insert(lessons)
          .values({
            teacherId: claimed.teacherId,
            studentId,
            date: claimed.date,
            time: claimed.time,
            endTime: addMinutes(claimed.time, LESSON_MINUTES),
            title: "Booked lesson",
            createdBy: request.user.sub,
          })
          .returning();
        if (!lesson) throw new Error("Failed to create lesson");

        await tx.insert(creditEntries).values({
          studentId,
          hours: -1,
          reason: "booking",
          description: "Lesson booking",
          lessonId: lesson.id,
          actorId: request.user.sub,
        });

        await tx.insert(activity).values({
          actorId: request.user.sub,
          action: "booking.created",
          targetType: "lesson",
          targetId: lesson.id,
          summary: `Booked a lesson on ${claimed.date} at ${claimed.time}`,
        });

        return lesson;
      });

      reply.status(201);
      return result;
    },
  );
};
