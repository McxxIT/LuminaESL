import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { settings } from "../db/schema";
import { badRequest } from "../lib/errors";
import { isValidClockTime } from "../lib/time";

const timeSchema = z
  .string()
  .refine(isValidClockTime, "Time must be in HH:MM 24-hour format");

const updateSettingsSchema = z.object({
  schoolName: z.string().trim().min(1).max(200).optional(),
  onTheSpotCancellationHours: z.number().int().min(0).max(168).optional(),
  performanceWindowDays: z.number().int().min(1).max(365).optional(),
  bookingDayStart: timeSchema.optional(),
  bookingDayEnd: timeSchema.optional(),
  studentLateCancellationHours: z.number().int().min(0).max(168).optional(),
  refundTeacherCancellations: z.boolean().optional(),
});

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: app.authenticate },
    async () => {
      const [row] = await app.db
        .select()
        .from(settings)
        .where(eq(settings.id, 1))
        .limit(1);
      return row ?? { id: 1 };
    },
  );

  app.patch(
    "/",
    { preHandler: app.requireRole("admin") },
    async (request) => {
      const body = updateSettingsSchema.parse(request.body);
      if (Object.keys(body).length === 0) {
        throw badRequest("No fields to update");
      }

      const [row] = await app.db
        .insert(settings)
        .values({ id: 1, ...body })
        .onConflictDoUpdate({ target: settings.id, set: body })
        .returning();

      return row;
    },
  );
};
