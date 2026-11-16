import type { FastifyPluginAsync } from "fastify";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { activity, creditEntries, users } from "../db/schema";
import { badRequest, forbidden } from "../lib/errors";
import { parsePagination } from "../lib/pagination";

const listQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  reason: z
    .enum(["purchase", "booking", "refund", "adjustment"])
    .optional(),
});

const createCreditSchema = z.object({
  studentId: z.string().uuid(),
  hours: z.number().int().min(-100).max(100),
  amount: z.number().int().min(0).optional(),
  reason: z.enum(["purchase", "refund", "adjustment"]),
  description: z.string().trim().min(1).max(500),
});

export const creditRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: app.authenticate },
    async (request) => {
      const query = listQuerySchema.parse(request.query);
      const { limit, offset } = parsePagination(request.query);
      const conditions: SQL[] = [];

      if (query.studentId) {
        conditions.push(eq(creditEntries.studentId, query.studentId));
      }
      if (query.reason) {
        conditions.push(eq(creditEntries.reason, query.reason));
      }

      if (request.user.role === "student") {
        conditions.push(eq(creditEntries.studentId, request.user.sub));
      }

      const where = conditions.length ? and(...conditions) : undefined;

      const items = await app.db
        .select()
        .from(creditEntries)
        .where(where)
        .orderBy(desc(creditEntries.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await app.db
        .select({ value: sql<number>`count(*)::int` })
        .from(creditEntries)
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
    "/balance/:studentId",
    { preHandler: app.authenticate },
    async (request) => {
      const params = z
        .object({ studentId: z.string().uuid() })
        .parse(request.params);

      if (
        request.user.role === "student" &&
        request.user.sub !== params.studentId
      ) {
        throw forbidden();
      }

      const [row] = await app.db
        .select({
          value: sql<number>`coalesce(sum(${creditEntries.hours}), 0)::int`,
        })
        .from(creditEntries)
        .where(eq(creditEntries.studentId, params.studentId));

      return { studentId: params.studentId, balance: row?.value ?? 0 };
    },
  );

  app.post(
    "/",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request, reply) => {
      const body = createCreditSchema.parse(request.body);

      const [student] = await app.db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, body.studentId))
        .limit(1);
      if (!student || student.role !== "student") {
        throw badRequest("studentId must belong to a student");
      }

      const [entry] = await app.db
        .insert(creditEntries)
        .values({
          studentId: body.studentId,
          hours: body.hours,
          amount: body.amount ?? null,
          reason: body.reason,
          description: body.description,
          actorId: request.user.sub,
        })
        .returning();
      if (!entry) throw new Error("Failed to record credit entry");

      await app.db.insert(activity).values({
        actorId: request.user.sub,
        action: "credit.recorded",
        targetType: "credit",
        targetId: entry.id,
        summary: `${body.hours > 0 ? "Added" : "Removed"} ${Math.abs(body.hours)} lesson credit(s)`,
      });

      reply.status(201);
      return entry;
    },
  );
};
