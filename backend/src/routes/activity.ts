import type { FastifyPluginAsync } from "fastify";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { activity } from "../db/schema";
import { parsePagination } from "../lib/pagination";

const listQuerySchema = z.object({
  action: z.string().trim().min(1).max(80).optional(),
  targetType: z.string().trim().min(1).max(40).optional(),
  targetId: z.string().trim().min(1).max(120).optional(),
  actorId: z.string().uuid().optional(),
});

/**
 * The admin activity log. The bootstrap payload already carries every entry for
 * admins; this endpoint is the paginated/filterable view for the log screens and
 * for any client that does not load the whole read model.
 */
export const activityRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: app.requireRole("admin") },
    async (request) => {
      const query = listQuerySchema.parse(request.query ?? {});
      const { limit, offset } = parsePagination(request.query);
      const conditions: SQL[] = [];

      if (query.action) conditions.push(eq(activity.action, query.action));
      if (query.targetType) {
        conditions.push(eq(activity.targetType, query.targetType));
      }
      if (query.targetId) conditions.push(eq(activity.targetId, query.targetId));
      if (query.actorId) conditions.push(eq(activity.actorId, query.actorId));

      const where = conditions.length ? and(...conditions) : undefined;

      const items = await app.db
        .select()
        .from(activity)
        .where(where)
        .orderBy(desc(activity.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await app.db
        .select({ value: sql<number>`count(*)::int` })
        .from(activity)
        .where(where);

      return { items, total: totalRow?.value ?? 0, limit, offset };
    },
  );
};
