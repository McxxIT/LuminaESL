import type { FastifyPluginAsync } from "fastify";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  activity,
  creditEntries,
  lessons,
  requests,
  settings,
  slotOpenings,
} from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import { parsePagination } from "../lib/pagination";
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

      const [created] = await app.db
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
      if (!created) throw new Error("Failed to create request");

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
        const [updated] = await tx
          .update(requests)
          .set({
            status: body.status,
            reviewedBy: request.user.sub,
            reviewedAt: new Date(),
            reviewNote: body.reviewNote ?? null,
          })
          .where(eq(requests.id, id))
          .returning();
        if (!updated) throw notFound("Request not found");

        if (body.status === "approved") {
          if (updated.type === "slot-closure") {
            if (updated.date && updated.time) {
              await tx
                .delete(slotOpenings)
                .where(
                  and(
                    eq(slotOpenings.teacherId, updated.teacherId),
                    eq(slotOpenings.date, updated.date),
                    eq(slotOpenings.time, updated.time),
                  ),
                );
            }
          } else if (updated.lessonId) {
            const [cancelled] = await tx
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
              });

            if (cancelled && shouldRefund) {
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

          await tx.insert(activity).values({
            actorId: request.user.sub,
            action: "request.approved",
            targetType: "request",
            targetId: id,
            summary: `Approved ${updated.type} request`,
          });
        }

        return updated;
      });

      return reviewed;
    },
  );
};
