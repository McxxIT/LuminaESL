import type { FastifyPluginAsync } from "fastify";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  creditEntries,
  lessons,
  requests,
  settings,
  slotOpenings,
} from "../db/schema";
import { logActivity } from "../lib/activity";
import { lockStudentCredits, isLessonCharged } from "../lib/credits";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { parsePagination } from "../lib/pagination";
import { managerOwnsTeacher, managerTeam } from "../lib/scope";
import { isValidClockTime } from "../lib/time";

const idParams = z.object({ id: z.string().uuid() });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuerySchema = z.object({
  teacherId: z.string().uuid().optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  type: z.enum(["slot-closure", "lesson-cancellation"]).optional(),
});

const createRequestSchema = z
  .object({
    type: z.enum(["slot-closure", "lesson-cancellation"]),
    teacherId: z.string().uuid().optional(),
    date: dateSchema.optional(),
    time: z
      .string()
      .refine(isValidClockTime, "Time must be in HH:MM 24-hour format")
      .optional(),
    lessonId: z.string().uuid().optional(),
    reason: z.string().trim().min(1).max(1000),
    comment: z.string().trim().max(2000).optional(),
    attachmentId: z.string().uuid().optional(),
  })
  .refine(
    (value) =>
      value.type === "slot-closure"
        ? Boolean(value.date && value.time)
        : Boolean(value.lessonId),
    {
      message:
        "slot-closure requests need date and time; lesson-cancellation requests need lessonId",
    },
  );

const reviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNote: z.string().trim().max(2000).optional(),
});

export const requestRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: app.requireRole(["admin", "manager", "teacher"]) },
    async (request) => {
      const query = listQuerySchema.parse(request.query);
      const { limit, offset } = parsePagination(request.query);
      const conditions: SQL[] = [];

      if (query.teacherId) {
        conditions.push(eq(requests.teacherId, query.teacherId));
      }
      if (query.status) conditions.push(eq(requests.status, query.status));
      if (query.type) conditions.push(eq(requests.type, query.type));

      if (request.user.role === "teacher") {
        conditions.push(eq(requests.teacherId, request.user.sub));
      } else if (request.user.role === "manager") {
        const team = await managerTeam(app.db, request.user.sub);
        conditions.push(
          team.teacherIds.length
            ? inArray(requests.teacherId, team.teacherIds)
            : sql`false`,
        );
      }

      const where = conditions.length ? and(...conditions) : undefined;

      const items = await app.db
        .select()
        .from(requests)
        .where(where)
        .orderBy(asc(requests.requestedAt))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await app.db
        .select({ value: sql<number>`count(*)::int` })
        .from(requests)
        .where(where);

      return {
        items,
        total: totalRow?.value ?? 0,
        limit,
        offset,
      };
    },
  );

  app.post(
    "/",
    { preHandler: app.requireRole(["admin", "manager", "teacher"]) },
    async (request, reply) => {
      const body = createRequestSchema.parse(request.body);
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

      if (body.type === "lesson-cancellation" && body.lessonId) {
        // The lesson must belong to the teacher the request is filed for.
        const [lesson] = await app.db
          .select({ teacherId: lessons.teacherId })
          .from(lessons)
          .where(eq(lessons.id, body.lessonId))
          .limit(1);
        if (!lesson) throw notFound("Lesson not found");
        if (lesson.teacherId !== teacherId) {
          throw forbidden("That lesson does not belong to this teacher");
        }
      }

      const created = await app.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(requests)
          .values({
            type: body.type,
            teacherId,
            date: body.date ?? null,
            time: body.time ?? null,
            lessonId: body.lessonId ?? null,
            reason: body.reason,
            comment: body.comment ?? null,
            attachmentId: body.attachmentId ?? null,
            requestedBy: request.user.sub,
          })
          .returning();
        if (!row) throw new Error("Failed to create request");
        await logActivity(tx, {
          actorId: request.user.sub,
          action: "request.created",
          targetType: "request",
          targetId: row.id,
          summary:
            row.type === "slot-closure"
              ? `Asked to close ${row.date} at ${row.time}`
              : "Asked to cancel a lesson",
        });
        return row;
      });

      reply.status(201);
      return created;
    },
  );

  app.post(
    "/:id/review",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = reviewSchema.parse(request.body);

      const [existing] = await app.db
        .select()
        .from(requests)
        .where(eq(requests.id, id))
        .limit(1);
      if (!existing) throw notFound("Request not found");
      if (
        request.user.role === "manager" &&
        !(await managerOwnsTeacher(app.db, request.user.sub, existing.teacherId))
      ) {
        throw forbidden();
      }
      if (existing.status !== "pending") {
        throw badRequest("This request has already been reviewed");
      }

      const [prefs] = await app.db
        .select({ refund: settings.refundTeacherCancellations })
        .from(settings)
        .where(eq(settings.id, 1))
        .limit(1);
      const shouldRefund = prefs?.refund ?? true;

      const reviewed = await app.db.transaction(async (tx) => {
        // Resolve the student before locking the ledger. The lesson's studentId is
        // immutable, and every credit path takes the student lock first, so this
        // keeps one global lock order (student -> request/lesson/slot).
        let studentId: string | null = null;
        if (existing.type === "lesson-cancellation" && existing.lessonId) {
          const [lessonOwner] = await tx
            .select({ studentId: lessons.studentId })
            .from(lessons)
            .where(eq(lessons.id, existing.lessonId))
            .limit(1);
          studentId = lessonOwner?.studentId ?? null;
        }
        if (studentId) await lockStudentCredits(tx, studentId);

        const [updated] = await tx
          .update(requests)
          .set({
            status: body.status,
            reviewedBy: request.user.sub,
            reviewedAt: new Date(),
            reviewNote: body.reviewNote ?? null,
          })
          .where(and(eq(requests.id, id), eq(requests.status, "pending")))
          .returning();
        if (!updated) throw conflict("This request has already been reviewed");

        if (body.status === "approved") {
          if (updated.type === "slot-closure") {
            if (updated.date && updated.time) {
              const closed = await tx
                .delete(slotOpenings)
                .where(
                  and(
                    eq(slotOpenings.teacherId, updated.teacherId),
                    eq(slotOpenings.date, updated.date),
                    eq(slotOpenings.time, updated.time),
                  ),
                )
                .returning({ id: slotOpenings.id });
              for (const slot of closed) {
                await logActivity(tx, {
                  actorId: request.user.sub,
                  action: "slot.closed",
                  targetType: "slot",
                  targetId: slot.id,
                  summary: `Closed ${updated.date} at ${updated.time}`,
                });
              }
            }
          } else if (updated.lessonId) {
            // Check the lesson before touching it: a completed lesson cannot be
            // cancelled (the throw rolls back, so the request stays pending), and an
            // already-cancelled lesson resolves the request without a second refund.
            const [lesson] = await tx
              .select({ id: lessons.id, status: lessons.status })
              .from(lessons)
              .where(eq(lessons.id, updated.lessonId))
              .for("update")
              .limit(1);
            if (lesson?.status === "completed") {
              throw conflict("A completed lesson cannot be cancelled");
            }
            const [cancelled] =
              lesson && lesson.status !== "cancelled"
                ? await tx
                    .update(lessons)
                    .set({
                      status: "cancelled",
                      cancelReason: updated.reason,
                      updatedAt: new Date(),
                    })
                    .where(eq(lessons.id, updated.lessonId))
                    .returning({
                      id: lessons.id,
                      studentId: lessons.studentId,
                    })
                : [];

            if (cancelled && shouldRefund) {
              // Only a lesson that was actually charged to this student may refund.
              const charged = await isLessonCharged(
                tx,
                cancelled.id,
                cancelled.studentId,
              );
              if (charged) {
                await tx.insert(creditEntries).values({
                  studentId: cancelled.studentId,
                  hours: 1,
                  reason: "refund",
                  description: "Refund for teacher-cancelled lesson",
                  lessonId: cancelled.id,
                  actorId: request.user.sub,
                });
              }
            }
          }
        }

        await logActivity(tx, {
          actorId: request.user.sub,
          action: `request.${body.status}`,
          targetType: "request",
          targetId: id,
          summary: `${body.status === "approved" ? "Approved" : "Declined"} ${updated.type} request`,
        });

        return updated;
      });

      return reviewed;
    },
  );

  app.post(
    "/:id/withdraw",
    { preHandler: app.requireRole(["admin", "manager", "teacher"]) },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const [existing] = await app.db.select().from(requests).where(eq(requests.id, id)).limit(1);
      if (!existing) throw notFound("Request not found");
      if (existing.status !== "pending") throw badRequest("Only pending requests can be withdrawn");
      if (request.user.role === "teacher" && existing.requestedBy !== request.user.sub) throw forbidden();
      if (request.user.role === "manager" && !(await managerOwnsTeacher(app.db, request.user.sub, existing.teacherId))) throw forbidden();

      const result = await app.db.transaction(async (tx) => {
        if (existing.type === "slot-closure" && existing.date && existing.time) {
          const [slot] = await tx.select({ id: slotOpenings.id }).from(slotOpenings)
            .where(and(eq(slotOpenings.teacherId, existing.teacherId), eq(slotOpenings.date, existing.date), eq(slotOpenings.time, existing.time))).limit(1);
          if (!slot) await tx.insert(slotOpenings).values({ teacherId: existing.teacherId, date: existing.date, time: existing.time, openedBy: request.user.sub });
        }
        const [deleted] = await tx.delete(requests).where(eq(requests.id, id)).returning({ id: requests.id });
        if (!deleted) throw notFound("Request not found");
        await logActivity(tx, {
          actorId: request.user.sub,
          action: "request.withdrawn",
          targetType: "request",
          targetId: id,
          summary: `Withdrew ${existing.type} request`,
        });
        return deleted;
      });
      return { ...result, withdrawn: true };
    },
  );
};
