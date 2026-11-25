import type { FastifyPluginAsync } from "fastify";
import { and, asc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  creditEntries,
  lessons,
  slotOpenings,
  users,
} from "../db/schema.js";
import {
  ACTIVE_LESSON_CONFLICT_MESSAGE,
  badRequest,
  conflict,
  forbidden,
  isActiveLessonSlotConflict,
  notFound,
  unprocessable,
} from "../lib/errors.js";
import { logActivity } from "../lib/activity.js";
import { getCreditBalance, lockStudentCredits } from "../lib/credits.js";
import { resolveLessonDefaults } from "../lib/lesson-defaults.js";
import { managerOwnsStudent, managerOwnsTeacher, managerTeam } from "../lib/scope.js";
import { addMinutes, isValidClockTime, LESSON_MINUTES } from "../lib/time.js";

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

      const slot = await app.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(slotOpenings)
          .values({
            teacherId,
            date: body.date,
            time: body.time,
            openedBy: request.user.sub,
          })
          .returning();
        if (!row) throw new Error("Failed to open slot");
        await logActivity(tx, {
          actorId: request.user.sub,
          action: "slot.opened",
          targetType: "slot",
          targetId: row.id,
          summary: `Opened ${row.date} at ${row.time}`,
        });
        return row;
      });

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

      await app.db.transaction(async (tx) => {
        const [deleted] = await tx
          .delete(slotOpenings)
          .where(eq(slotOpenings.id, id))
          .returning({ id: slotOpenings.id });
        if (!deleted) throw notFound("Slot not found");
        await logActivity(tx, {
          actorId: request.user.sub,
          action: "slot.closed",
          targetType: "slot",
          targetId: id,
          summary: `Closed ${slot.date} at ${slot.time}`,
        });
      });
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

      let result: typeof lessons.$inferSelect;
      try {
        result = await app.db.transaction(async (tx) => {
          // Lock the student's ledger first (single lock order across every credit path).
          await lockStudentCredits(tx, studentId);

          const [slot] = await tx
            .select()
            .from(slotOpenings)
            .where(eq(slotOpenings.id, body.slotId))
            .limit(1);
          if (!slot) throw notFound("Slot not found");

          const balance = await getCreditBalance(tx, studentId);
          if (balance < 1) {
            throw unprocessable("Student does not have enough lesson credits");
          }

          const [claimed] = await tx
            .delete(slotOpenings)
            .where(eq(slotOpenings.id, body.slotId))
            .returning();
          if (!claimed) throw conflict("That slot was just taken");

          const defaults = await resolveLessonDefaults(tx, {
            teacherId: claimed.teacherId,
            studentId,
            actorId: request.user.sub,
          });

          const [lesson] = await tx
            .insert(lessons)
            .values({
              teacherId: claimed.teacherId,
              studentId,
              date: claimed.date,
              time: claimed.time,
              endTime: addMinutes(claimed.time, LESSON_MINUTES),
              title: "Booked lesson",
              enrollmentId: defaults.enrollmentId,
              lessonPlanId: defaults.lessonPlanId,
              planAttachedBy: defaults.planAttachedBy,
              planAttachedAt: defaults.planAttachedAt,
              roomCode: defaults.roomCode,
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

          await logActivity(tx, {
            actorId: request.user.sub,
            action: "lesson.booked",
            targetType: "lesson",
            targetId: lesson.id,
            summary: `Booked a lesson on ${claimed.date} at ${claimed.time}`,
          });

          return lesson;
        });
      } catch (error) {
        // An open slot does not guarantee a free teacher/time key. The partial unique index
        // decides, and its violation rolls the slot claim and debit back with the lesson.
        if (isActiveLessonSlotConflict(error)) {
          throw conflict(ACTIVE_LESSON_CONFLICT_MESSAGE);
        }
        throw error;
      }

      reply.status(201);
      return result;
    },
  );
};
