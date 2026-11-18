import type { FastifyPluginAsync } from "fastify";
import { desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { activity, notificationState } from "../db/schema";
import {
  MAX_NOTIFICATION_READ_IDS,
  NOTIFICATION_CATEGORIES,
  normalizeReadIds,
} from "../lib/notifications";
import { parsePagination } from "../lib/pagination";

const stateSchema = z
  .object({
    mutedCategories: z
      .array(z.enum(NOTIFICATION_CATEGORIES))
      .max(NOTIFICATION_CATEGORIES.length)
      .optional(),
    readIds: z
      .array(z.string().min(1).max(200))
      .max(MAX_NOTIFICATION_READ_IDS * 4)
      .optional(),
  })
  .strict();

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

  /** Muted categories and read markers for the signed-in user. */
  app.get(
    "/state",
    { preHandler: app.authenticate },
    async (request) => {
      const [row] = await app.db
        .select()
        .from(notificationState)
        .where(eq(notificationState.userId, request.user.sub))
        .limit(1);

      return {
        mutedCategories: row?.mutedCategories ?? [],
        readIds: row?.readIds ?? [],
      };
    },
  );

  /** Partial update: omitted fields keep their stored value. */
  app.patch(
    "/state",
    { preHandler: app.authenticate },
    async (request) => {
      const body = stateSchema.parse(request.body ?? {});
      const readIds =
        body.readIds === undefined ? undefined : normalizeReadIds(body.readIds);

      const [row] = await app.db
        .insert(notificationState)
        .values({
          userId: request.user.sub,
          ...(body.mutedCategories === undefined
            ? {}
            : { mutedCategories: body.mutedCategories }),
          ...(readIds === undefined ? {} : { readIds }),
        })
        .onConflictDoUpdate({
          target: notificationState.userId,
          set: {
            ...(body.mutedCategories === undefined
              ? {}
              : { mutedCategories: body.mutedCategories }),
            ...(readIds === undefined ? {} : { readIds }),
            updatedAt: new Date(),
          },
        })
        .returning();

      return {
        mutedCategories: row?.mutedCategories ?? [],
        readIds: row?.readIds ?? [],
      };
    },
  );
};
