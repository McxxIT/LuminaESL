import type { FastifyPluginAsync } from "fastify";
import { desc, eq, or, sql } from "drizzle-orm";
import { activity } from "../db/schema";
import { parsePagination } from "../lib/pagination";

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: app.authenticate },
    async (request) => {
      const { limit, offset } = parsePagination(request.query);

      const where = or(
        eq(activity.actorId, request.user.sub),
        sql`${activity.targetId} = ${request.user.sub}`,
      );

      const items = await app.db
        .select()
        .from(activity)
        .where(where)
        .orderBy(desc(activity.createdAt))
        .limit(limit)
        .offset(offset);

      return { items, limit, offset };
    },
  );
};
