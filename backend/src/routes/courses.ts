import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  and,
  asc,
  eq,
  ilike,
  inArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import {
  courseUnits,
  courses,
  lessonPlans,
  type LessonPlanSection,
} from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import { parsePagination } from "../lib/pagination";

const idParams = z.object({ id: z.string().uuid() });
const unitParams = z.object({
  id: z.string().uuid(),
  unitId: z.string().uuid(),
});
const planParams = z.object({
  unitId: z.string().uuid(),
  planId: z.string().uuid(),
});

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  level: z.string().trim().max(60).optional(),
  ownerId: z.string().uuid().optional(),
});

const sectionSchema = z.object({
  heading: z.string().trim().min(1).max(200),
  items: z.array(z.string().trim().min(1).max(500)).max(100),
});

const createCourseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  level: z.string().trim().min(1).max(60),
  summary: z.string().trim().max(2000).optional(),
  objectives: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

const updateCourseSchema = createCourseSchema.partial();

const createUnitSchema = z.object({
  title: z.string().trim().min(1).max(200),
  order: z.number().int().min(0).optional(),
});

const updateUnitSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  order: z.number().int().min(0).optional(),
});

const createPlanSchema = z.object({
  title: z.string().trim().min(1).max(200),
  order: z.number().int().min(0).optional(),
  focus: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  summary: z.string().trim().max(4000).optional(),
  sections: z.array(sectionSchema).max(50).optional(),
  attachmentIds: z.array(z.string().uuid()).max(30).optional(),
});

const updatePlanSchema = createPlanSchema.partial();

async function ensureCourse(app: FastifyInstance, id: string) {
  const [course] = await app.db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, id))
    .limit(1);
  if (!course) throw notFound("Course not found");
}

function withPlans(
  units: (typeof courseUnits.$inferSelect)[],
  plans: (typeof lessonPlans.$inferSelect)[],
) {
  return units.map((unit) => ({
    ...unit,
    plans: plans.filter((plan) => plan.unitId === unit.id),
  }));
}

export const courseRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: app.authenticate },
    async (request) => {
      const query = listQuerySchema.parse(request.query);
      const { limit, offset } = parsePagination(request.query);
      const conditions: SQL[] = [];

      if (query.q) conditions.push(ilike(courses.title, `%${query.q}%`));
      if (query.status) conditions.push(eq(courses.status, query.status));
      if (query.level) conditions.push(eq(courses.level, query.level));
      if (query.ownerId) conditions.push(eq(courses.ownerId, query.ownerId));

      const where = conditions.length ? and(...conditions) : undefined;

      const items = await app.db
        .select()
        .from(courses)
        .where(where)
        .orderBy(asc(courses.title))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await app.db
        .select({ value: sql<number>`count(*)::int` })
        .from(courses)
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

      const [course] = await app.db
        .select()
        .from(courses)
        .where(eq(courses.id, id))
        .limit(1);
      if (!course) throw notFound("Course not found");

      const units = await app.db
        .select()
        .from(courseUnits)
        .where(eq(courseUnits.courseId, id))
        .orderBy(asc(courseUnits.order));

      const unitIds = units.map((unit) => unit.id);
      const plans = unitIds.length
        ? await app.db
            .select()
            .from(lessonPlans)
            .where(inArray(lessonPlans.unitId, unitIds))
            .orderBy(asc(lessonPlans.order))
        : [];

      return { ...course, units: withPlans(units, plans) };
    },
  );

  app.post(
    "/",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request, reply) => {
      const body = createCourseSchema.parse(request.body);
      const [course] = await app.db
        .insert(courses)
        .values({
          title: body.title,
          level: body.level,
          summary: body.summary ?? "",
          objectives: body.objectives ?? [],
          status: body.status ?? "draft",
          ownerId: request.user.sub,
        })
        .returning();
      if (!course) throw new Error("Failed to create course");

      reply.status(201);
      return course;
    },
  );

  app.patch(
    "/:id",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = updateCourseSchema.parse(request.body);
      if (Object.keys(body).length === 0) {
        throw badRequest("No fields to update");
      }

      const [updated] = await app.db
        .update(courses)
        .set({
          ...(body.title !== undefined && { title: body.title }),
          ...(body.level !== undefined && { level: body.level }),
          ...(body.summary !== undefined && { summary: body.summary }),
          ...(body.objectives !== undefined && {
            objectives: body.objectives,
          }),
          ...(body.status !== undefined && { status: body.status }),
          updatedAt: new Date(),
        })
        .where(eq(courses.id, id))
        .returning();
      if (!updated) throw notFound("Course not found");

      return updated;
    },
  );

  app.delete(
    "/:id",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const [archived] = await app.db
        .update(courses)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(courses.id, id))
        .returning({ id: courses.id, status: courses.status });
      if (!archived) throw notFound("Course not found");
      return archived;
    },
  );

  app.post(
    "/:id/units",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const body = createUnitSchema.parse(request.body);
      await ensureCourse(app, id);

      const [maxRow] = await app.db
        .select({
          value: sql<number>`coalesce(max(${courseUnits.order}), 0)::int`,
        })
        .from(courseUnits)
        .where(eq(courseUnits.courseId, id));

      const [unit] = await app.db
        .insert(courseUnits)
        .values({
          courseId: id,
          title: body.title,
          order: body.order ?? (maxRow?.value ?? 0) + 1,
        })
        .returning();
      if (!unit) throw new Error("Failed to create unit");

      reply.status(201);
      return unit;
    },
  );

  app.patch(
    "/:id/units/:unitId",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request) => {
      const { unitId } = unitParams.parse(request.params);
      const body = updateUnitSchema.parse(request.body);
      if (Object.keys(body).length === 0) {
        throw badRequest("No fields to update");
      }

      const [updated] = await app.db
        .update(courseUnits)
        .set({
          ...(body.title !== undefined && { title: body.title }),
          ...(body.order !== undefined && { order: body.order }),
        })
        .where(eq(courseUnits.id, unitId))
        .returning();
      if (!updated) throw notFound("Unit not found");

      return updated;
    },
  );

  app.delete(
    "/:id/units/:unitId",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request) => {
      const { unitId } = unitParams.parse(request.params);
      const [deleted] = await app.db
        .delete(courseUnits)
        .where(eq(courseUnits.id, unitId))
        .returning({ id: courseUnits.id });
      if (!deleted) throw notFound("Unit not found");
      return { id: deleted.id, deleted: true };
    },
  );

  app.post(
    "/:id/units/:unitId/plans",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request, reply) => {
      const { unitId } = unitParams.parse(request.params);
      const body = createPlanSchema.parse(request.body);

      const [unit] = await app.db
        .select({ id: courseUnits.id })
        .from(courseUnits)
        .where(eq(courseUnits.id, unitId))
        .limit(1);
      if (!unit) throw notFound("Unit not found");

      const [maxRow] = await app.db
        .select({
          value: sql<number>`coalesce(max(${lessonPlans.order}), 0)::int`,
        })
        .from(lessonPlans)
        .where(eq(lessonPlans.unitId, unitId));

      const sections: LessonPlanSection[] = body.sections ?? [];

      const [plan] = await app.db
        .insert(lessonPlans)
        .values({
          unitId,
          title: body.title,
          order: body.order ?? (maxRow?.value ?? 0) + 1,
          focus: body.focus ?? [],
          summary: body.summary ?? "",
          sections,
          attachmentIds: body.attachmentIds ?? [],
        })
        .returning();
      if (!plan) throw new Error("Failed to create lesson plan");

      reply.status(201);
      return plan;
    },
  );

  app.patch(
    "/:id/units/:unitId/plans/:planId",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request) => {
      const { planId } = planParams.parse(request.params);
      const body = updatePlanSchema.parse(request.body);
      if (Object.keys(body).length === 0) {
        throw badRequest("No fields to update");
      }

      const [updated] = await app.db
        .update(lessonPlans)
        .set({
          ...(body.title !== undefined && { title: body.title }),
          ...(body.order !== undefined && { order: body.order }),
          ...(body.focus !== undefined && { focus: body.focus }),
          ...(body.summary !== undefined && { summary: body.summary }),
          ...(body.sections !== undefined && { sections: body.sections }),
          ...(body.attachmentIds !== undefined && {
            attachmentIds: body.attachmentIds,
          }),
          updatedAt: new Date(),
        })
        .where(eq(lessonPlans.id, planId))
        .returning();
      if (!updated) throw notFound("Lesson plan not found");

      return updated;
    },
  );

  app.delete(
    "/:id/units/:unitId/plans/:planId",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request) => {
      const { planId } = planParams.parse(request.params);
      const [deleted] = await app.db
        .delete(lessonPlans)
        .where(eq(lessonPlans.id, planId))
        .returning({ id: lessonPlans.id });
      if (!deleted) throw notFound("Lesson plan not found");
      return { id: deleted.id, deleted: true };
    },
  );
};
