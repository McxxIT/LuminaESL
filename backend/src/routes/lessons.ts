import type { FastifyPluginAsync } from "fastify";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { lessons, ratings, users } from "../db/schema";
import { logActivity } from "../lib/activity";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { parsePagination } from "../lib/pagination";
import { addMinutes, isValidClockTime, LESSON_MINUTES } from "../lib/time";

const idParams = z.object({ id: z.string().uuid() });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z
  .string()
  .refine(isValidClockTime, "Time must be in HH:MM 24-hour format");

const listQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  teacherId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  enrollmentId: z.string().uuid().optional(),
  status: z
    .enum(["scheduled", "live", "completed", "cancelled"])
    .optional(),
});

const scoreSchema = z.object({
  label: z.string().trim().min(1).max(120),
  value: z.number().min(0).max(100),
});

const correctionSchema = z.object({
  from: z.string().trim().min(1).max(300),
  to: z.string().trim().min(1).max(300),
});

const createLessonSchema = z.object({
  teacherId: z.string().uuid().optional(),
  studentId: z.string().uuid(),
  enrollmentId: z.string().uuid().nullish(),
  date: dateSchema,
  time: timeSchema,
  title: z.string().trim().min(1).max(200),
  focus: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  roomCode: z.string().trim().max(40).optional(),
  lessonPlanId: z.string().uuid().nullish(),
});

const updateLessonSchema = z.object({
  date: dateSchema.optional(),
  time: timeSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  focus: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  status: z
    .enum(["scheduled", "live", "completed", "cancelled"])
    .optional(),
  roomCode: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(8000).nullable().optional(),
  homework: z.string().trim().max(8000).nullable().optional(),
  attendance: z.enum(["attended", "no-show"]).nullable().optional(),
  feedback: z.string().trim().max(8000).nullable().optional(),
  scores: z.array(scoreSchema).max(30).optional(),
  corrections: z.array(correctionSchema).max(100).optional(),
  cancelReason: z.string().trim().max(1000).nullable().optional(),
  lessonPlanId: z.string().uuid().nullable().optional(),
});

const completeLessonSchema = z.object({
  attendance: z.enum(["attended", "no-show"]),
  notes: z.string().trim().max(8000).optional(),
  homework: z.string().trim().max(8000).optional(),
  feedback: z.string().trim().max(8000).optional(),
  scores: z.array(scoreSchema).max(30).optional(),
  corrections: z.array(correctionSchema).max(100).optional(),
});

const rateSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
  from: z.enum(["student", "parent"]).optional(),
});

const teacherUser = alias(users, "teacher_user");
const studentUser = alias(users, "student_user");

const lessonColumns = {
  id: lessons.id,
  enrollmentId: lessons.enrollmentId,
  teacherId: lessons.teacherId,
  studentId: lessons.studentId,
  date: lessons.date,
  time: lessons.time,
  endTime: lessons.endTime,
  title: lessons.title,
  focus: lessons.focus,
  status: lessons.status,
  roomCode: lessons.roomCode,
  lessonPlanId: lessons.lessonPlanId,
  notes: lessons.notes,
  homework: lessons.homework,
  attendance: lessons.attendance,
  feedback: lessons.feedback,
  scores: lessons.scores,
  corrections: lessons.corrections,
  cancelReason: lessons.cancelReason,
  createdBy: lessons.createdBy,
  createdAt: lessons.createdAt,
  updatedAt: lessons.updatedAt,
  teacherName: teacherUser.name,
  studentName: studentUser.name,
};

export const lessonRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: app.authenticate },
    async (request) => {
      const query = listQuerySchema.parse(request.query);
      const { limit, offset } = parsePagination(request.query);
      const conditions: SQL[] = [];

      if (query.from) conditions.push(gte(lessons.date, query.from));
      if (query.to) conditions.push(lte(lessons.date, query.to));
      if (query.teacherId) {
        conditions.push(eq(lessons.teacherId, query.teacherId));
      }
      if (query.studentId) {
        conditions.push(eq(lessons.studentId, query.studentId));
      }
      if (query.enrollmentId) {
        conditions.push(eq(lessons.enrollmentId, query.enrollmentId));
      }
      if (query.status) conditions.push(eq(lessons.status, query.status));

      if (request.user.role === "student") {
        conditions.push(eq(lessons.studentId, request.user.sub));
      } else if (request.user.role === "teacher") {
        conditions.push(eq(lessons.teacherId, request.user.sub));
      }

      const where = conditions.length ? and(...conditions) : undefined;

      const items = await app.db
        .select(lessonColumns)
        .from(lessons)
        .innerJoin(teacherUser, eq(teacherUser.id, lessons.teacherId))
        .innerJoin(studentUser, eq(studentUser.id, lessons.studentId))
        .where(where)
        .orderBy(asc(lessons.date), asc(lessons.time))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await app.db
        .select({ value: sql<number>`count(*)::int` })
        .from(lessons)
        .where(where);

      return {
        items,
        total: totalRow?.value ?? 0,
        limit,
        offset,
      };
    },
  );

  app.get(
    "/:id",
    { preHandler: app.authenticate },
    async (request) => {
      const { id } = idParams.parse(request.params);

      const [lesson] = await app.db
        .select(lessonColumns)
        .from(lessons)
        .innerJoin(teacherUser, eq(teacherUser.id, lessons.teacherId))
        .innerJoin(studentUser, eq(studentUser.id, lessons.studentId))
        .where(eq(lessons.id, id))
        .limit(1);
      if (!lesson) throw notFound("Lesson not found");

      if (
        request.user.role === "student" &&
        lesson.studentId !== request.user.sub
      ) {
        throw forbidden();
      }
      if (
        request.user.role === "teacher" &&
        lesson.teacherId !== request.user.sub
      ) {
        throw forbidden();
      }

      const lessonRatings = await app.db
        .select()
        .from(ratings)
        .where(eq(ratings.lessonId, id));

      return { ...lesson, ratings: lessonRatings };
    },
  );

  app.post(
    "/",
    { preHandler: app.requireRole(["admin", "manager", "teacher"]) },
    async (request, reply) => {
      const body = createLessonSchema.parse(request.body);

      const teacherId =
        request.user.role === "teacher"
          ? request.user.sub
          : body.teacherId;
      if (!teacherId) throw badRequest("teacherId is required");

      const [teacher] = await app.db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, teacherId))
        .limit(1);
      if (!teacher || teacher.role !== "teacher") {
        throw badRequest("teacherId must belong to a teacher");
      }

      const [student] = await app.db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, body.studentId))
        .limit(1);
      if (!student || student.role !== "student") {
        throw badRequest("studentId must belong to a student");
      }

      const [lesson] = await app.db
        .insert(lessons)
        .values({
          teacherId,
          studentId: body.studentId,
          enrollmentId: body.enrollmentId ?? null,
          date: body.date,
          time: body.time,
          endTime: addMinutes(body.time, LESSON_MINUTES),
          title: body.title,
          focus: body.focus ?? [],
          roomCode: body.roomCode ?? null,
          lessonPlanId: body.lessonPlanId ?? null,
          createdBy: request.user.sub,
        })
        .returning();
      if (!lesson) throw new Error("Failed to create lesson");

      await logActivity(app.db, {
        actorId: request.user.sub,
        action: "lesson.created",
        targetType: "lesson",
        targetId: lesson.id,
        summary: `Scheduled lesson "${lesson.title}"`,
      });

      reply.status(201);
      return lesson;
    },
  );

  app.patch(
    "/:id",
    { preHandler: app.requireRole(["admin", "manager", "teacher"]) },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = updateLessonSchema.parse(request.body);
      if (Object.keys(body).length === 0) {
        throw badRequest("No fields to update");
      }

      const [existing] = await app.db
        .select({ teacherId: lessons.teacherId })
        .from(lessons)
        .where(eq(lessons.id, id))
        .limit(1);
      if (!existing) throw notFound("Lesson not found");
      if (
        request.user.role === "teacher" &&
        existing.teacherId !== request.user.sub
      ) {
        throw forbidden();
      }

      const [updated] = await app.db
        .update(lessons)
        .set({
          ...(body.date !== undefined && { date: body.date }),
          ...(body.time !== undefined && {
            time: body.time,
            endTime: addMinutes(body.time, LESSON_MINUTES),
          }),
          ...(body.title !== undefined && { title: body.title }),
          ...(body.focus !== undefined && { focus: body.focus }),
          ...(body.status !== undefined && { status: body.status }),
          ...(body.roomCode !== undefined && { roomCode: body.roomCode }),
          ...(body.notes !== undefined && { notes: body.notes }),
          ...(body.homework !== undefined && { homework: body.homework }),
          ...(body.attendance !== undefined && {
            attendance: body.attendance,
          }),
          ...(body.feedback !== undefined && { feedback: body.feedback }),
          ...(body.scores !== undefined && { scores: body.scores }),
          ...(body.corrections !== undefined && {
            corrections: body.corrections,
          }),
          ...(body.cancelReason !== undefined && {
            cancelReason: body.cancelReason,
          }),
          ...(body.lessonPlanId !== undefined && {
            lessonPlanId: body.lessonPlanId,
            planAttachedBy: request.user.sub,
            planAttachedAt: new Date(),
          }),
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, id))
        .returning();
      if (!updated) throw notFound("Lesson not found");

      return updated;
    },
  );

  app.post(
    "/:id/complete",
    { preHandler: app.requireRole(["admin", "manager", "teacher"]) },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = completeLessonSchema.parse(request.body);

      const [existing] = await app.db
        .select({ teacherId: lessons.teacherId, title: lessons.title })
        .from(lessons)
        .where(eq(lessons.id, id))
        .limit(1);
      if (!existing) throw notFound("Lesson not found");
      if (
        request.user.role === "teacher" &&
        existing.teacherId !== request.user.sub
      ) {
        throw forbidden();
      }

      const [updated] = await app.db
        .update(lessons)
        .set({
          status: "completed",
          attendance: body.attendance,
          ...(body.notes !== undefined && { notes: body.notes }),
          ...(body.homework !== undefined && { homework: body.homework }),
          ...(body.feedback !== undefined && { feedback: body.feedback }),
          ...(body.scores !== undefined && { scores: body.scores }),
          ...(body.corrections !== undefined && {
            corrections: body.corrections,
          }),
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, id))
        .returning();
      if (!updated) throw notFound("Lesson not found");

      await logActivity(app.db, {
        actorId: request.user.sub,
        action: "lesson.completed",
        targetType: "lesson",
        targetId: id,
        summary: `Completed lesson "${existing.title}"`,
      });

      return updated;
    },
  );

  app.post(
    "/:id/ratings",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const body = rateSchema.parse(request.body);

      const [lesson] = await app.db
        .select({
          teacherId: lessons.teacherId,
          studentId: lessons.studentId,
        })
        .from(lessons)
        .where(eq(lessons.id, id))
        .limit(1);
      if (!lesson) throw notFound("Lesson not found");

      const isStaff =
        request.user.role === "admin" || request.user.role === "manager";
      if (!isStaff && request.user.sub !== lesson.studentId) {
        throw forbidden("Only the enrolled student can rate this lesson");
      }

      const [author] = await app.db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, request.user.sub))
        .limit(1);

      const [rating] = await app.db
        .insert(ratings)
        .values({
          lessonId: id,
          teacherId: lesson.teacherId,
          studentId: lesson.studentId,
          from: body.from ?? "student",
          authorId: request.user.sub,
          authorName: author?.name ?? "Student",
          score: body.score,
          comment: body.comment ?? null,
        })
        .returning();
      if (!rating) throw new Error("Failed to create rating");

      reply.status(201);
      return rating;
    },
  );
};
