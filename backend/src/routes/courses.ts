import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  and,
  asc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import {
  courseUnits,
  courses,
  attachments,
  enrollments,
  lessonPlans,
  lessons,
  type LessonPlanSection,
} from "../db/schema";
import { badRequest, conflict, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { parsePagination } from "../lib/pagination";
import { assertCourseEditable } from "../lib/scope";
import type { TokenPayload } from "../types/fastify";

const idParams = z.object({ id: z.string().uuid() });
const unitParams = z.object({
  id: z.string().uuid(),
  unitId: z.string().uuid(),
});
const planParams = z.object({
  unitId: z.string().uuid(),
  planId: z.string().uuid(),
});
const attachmentParams = planParams.extend({ attachmentId: z.string().uuid() });

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
const attachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(120),
  size: z.number().int().nonnegative(),
  storageKey: z.string().trim().min(1).max(500),
});

/** Resolve a plan's owning course and enforce the owner/admin write rule. */
async function assertPlanEditable(
  app: FastifyInstance,
  actor: TokenPayload,
  unitId: string,
  planId: string,
) {
  const [plan] = await app.db
    .select({
      id: lessonPlans.id,
      unitId: lessonPlans.unitId,
      courseId: courseUnits.courseId,
    })
    .from(lessonPlans)
    .innerJoin(courseUnits, eq(courseUnits.id, lessonPlans.unitId))
    .where(and(eq(lessonPlans.id, planId), eq(lessonPlans.unitId, unitId)))
    .limit(1);
  if (!plan) throw notFound("Lesson plan not found");
  await assertCourseEditable(app.db, actor, plan.courseId);
  return plan;
}

/** `plansForCourse` in the browser store: every plan under the course's units. */
async function countCoursePlans(app: FastifyInstance, courseId: string) {
  const [row] = await app.db
    .select({ value: sql<number>`count(*)::int` })
    .from(lessonPlans)
    .innerJoin(courseUnits, eq(courseUnits.id, lessonPlans.unitId))
    .where(eq(courseUnits.courseId, courseId));
  return row?.value ?? 0;
}

async function countActiveEnrollments(app: FastifyInstance, courseId: string) {
  const [row] = await app.db
    .select({ value: sql<number>`count(*)::int` })
    .from(enrollments)
    .where(
      and(eq(enrollments.courseId, courseId), eq(enrollments.status, "active")),
    );
  return row?.value ?? 0;
}

/** Archiving is refused while students are still enrolled, like the browser store. */
async function assertCourseArchivable(app: FastifyInstance, courseId: string) {
  const enrolled = await countActiveEnrollments(app, courseId);
  if (enrolled > 0) {
    throw conflict(
      `${enrolled} student${enrolled === 1 ? " is" : "s are"} enrolled in this course. Move them to another course first.`,
    );
  }
}

/** Publishing needs at least one plan so students and teachers have something to open. */
async function assertCoursePublishable(app: FastifyInstance, courseId: string) {
  const plans = await countCoursePlans(app, courseId);
  if (plans === 0) {
    throw badRequest("Add at least one lesson plan before publishing.");
  }
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

      if (request.user.role === "manager") {
        conditions.push(
          or(
            eq(courses.status, "published"),
            eq(courses.ownerId, request.user.sub),
          )!,
        );
      } else if (request.user.role !== "admin") {
        conditions.push(eq(courses.status, "published"));
      }

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
      const course = await app.db.transaction(async (tx) => {
        const [created] = await tx
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
        if (!created) throw new Error("Failed to create course");

        // The browser store starts every course with one unit, like the admin UI expects.
        await tx.insert(courseUnits).values({
          courseId: created.id,
          order: 1,
          title: "Unit 1",
        });
        return created;
      });
      if (!course) throw new Error("Failed to create course");

      await logActivity(app.db, {
        actorId: request.user.sub,
        action: "course.created",
        targetType: "course",
        targetId: course.id,
        summary: course.title,
      });

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

      await assertCourseEditable(app.db, request.user, id);
      if (body.status === "published") {
        await assertCoursePublishable(app, id);
      }
      if (body.status === "archived") {
        await assertCourseArchivable(app, id);
      }

      const [before] = await app.db
        .select({ status: courses.status })
        .from(courses)
        .where(eq(courses.id, id))
        .limit(1);

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

      const statusChanged =
        body.status !== undefined && before?.status !== body.status;
      await logActivity(app.db, {
        actorId: request.user.sub,
        action: statusChanged ? `course.${updated.status}` : "course.updated",
        targetType: "course",
        targetId: updated.id,
        summary: updated.title,
      });

      return updated;
    },
  );

  app.delete(
    "/:id",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request) => {
      const { id } = idParams.parse(request.params);
      await assertCourseEditable(app.db, request.user, id);
      await assertCourseArchivable(app, id);
      const [archived] = await app.db
        .update(courses)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(courses.id, id))
        .returning({ id: courses.id, status: courses.status, title: courses.title });
      if (!archived) throw notFound("Course not found");

      await logActivity(app.db, {
        actorId: request.user.sub,
        action: "course.archived",
        targetType: "course",
        targetId: archived.id,
        summary: archived.title,
      });

      return { id: archived.id, status: archived.status };
    },
  );

  app.post(
    "/:id/duplicate",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const [source] = await app.db.select().from(courses).where(eq(courses.id, id)).limit(1);
      if (!source) throw notFound("Course not found");
      // Any manager may duplicate a visible course; the copy is owned by the actor.
      // Delete/update stay owner-only, like `canEditCourse` in the browser store.
      const copy = await app.db.transaction(async (tx) => {
        const [created] = await tx.insert(courses).values({
          title: `${source.title} (Copy)`, level: source.level, summary: source.summary,
          objectives: source.objectives, status: "draft", ownerId: request.user.sub,
        }).returning();
        if (!created) throw new Error("Failed to duplicate course");
        const units = await tx.select().from(courseUnits).where(eq(courseUnits.courseId, id)).orderBy(asc(courseUnits.order));
        for (const unit of units) {
          const [newUnit] = await tx.insert(courseUnits).values({ courseId: created.id, title: unit.title, order: unit.order }).returning();
          if (!newUnit) continue;
          const plans = await tx.select().from(lessonPlans).where(eq(lessonPlans.unitId, unit.id)).orderBy(asc(lessonPlans.order));
          if (plans.length) await tx.insert(lessonPlans).values(plans.map((plan) => ({
            unitId: newUnit.id, order: plan.order, title: plan.title, focus: plan.focus,
            summary: plan.summary, sections: plan.sections, attachmentIds: plan.attachmentIds,
          })));
        }
        return created;
      });
      if (!copy) throw new Error("Failed to duplicate course");

      await logActivity(app.db, {
        actorId: request.user.sub,
        action: "course.duplicated",
        targetType: "course",
        targetId: copy.id,
        summary: `From ${source.title}`,
      });

      reply.status(201);
      return copy;
    },
  );

  app.post(
    "/:id/units",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const body = createUnitSchema.parse(request.body);
      await assertCourseEditable(app.db, request.user, id);

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
      const { id, unitId } = unitParams.parse(request.params);
      const body = updateUnitSchema.parse(request.body);
      if (Object.keys(body).length === 0) {
        throw badRequest("No fields to update");
      }

      const [unit] = await app.db
        .select({ courseId: courseUnits.courseId })
        .from(courseUnits)
        .where(eq(courseUnits.id, unitId))
        .limit(1);
      if (!unit || unit.courseId !== id) throw notFound("Unit not found");
      await assertCourseEditable(app.db, request.user, id);

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
      const { id, unitId } = unitParams.parse(request.params);

      const [unit] = await app.db
        .select({ id: courseUnits.id, courseId: courseUnits.courseId })
        .from(courseUnits)
        .where(eq(courseUnits.id, unitId))
        .limit(1);
      if (!unit || unit.courseId !== id) throw notFound("Unit not found");
      await assertCourseEditable(app.db, request.user, id);

      const [planRow] = await app.db
        .select({ value: sql<number>`count(*)::int` })
        .from(lessonPlans)
        .where(eq(lessonPlans.unitId, unitId));
      if ((planRow?.value ?? 0) > 0) {
        throw conflict("Move or delete this unit's lesson plans first.");
      }

      const [unitRow] = await app.db
        .select({ value: sql<number>`count(*)::int` })
        .from(courseUnits)
        .where(eq(courseUnits.courseId, id));
      if ((unitRow?.value ?? 0) <= 1) {
        throw conflict("A course needs at least one unit.");
      }

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
      const { id, unitId } = unitParams.parse(request.params);
      const body = createPlanSchema.parse(request.body);

      const [unit] = await app.db
        .select({ id: courseUnits.id, courseId: courseUnits.courseId })
        .from(courseUnits)
        .where(eq(courseUnits.id, unitId))
        .limit(1);
      if (!unit || unit.courseId !== id) throw notFound("Unit not found");
      await assertCourseEditable(app.db, request.user, id);

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
      const { unitId, planId } = planParams.parse(request.params);
      const body = updatePlanSchema.parse(request.body);
      if (Object.keys(body).length === 0) {
        throw badRequest("No fields to update");
      }

      await assertPlanEditable(app, request.user, unitId, planId);

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
      const { unitId, planId } = planParams.parse(request.params);

      await assertPlanEditable(app, request.user, unitId, planId);

      const [usedRow] = await app.db
        .select({ value: sql<number>`count(*)::int` })
        .from(lessons)
        .where(eq(lessons.lessonPlanId, planId));
      const used = usedRow?.value ?? 0;
      if (used > 0) {
        throw conflict(
          `This plan is attached to ${used} lesson${used === 1 ? "" : "s"}. Archive the course instead of deleting it.`,
        );
      }

      const [deleted] = await app.db
        .delete(lessonPlans)
        .where(eq(lessonPlans.id, planId))
        .returning({ id: lessonPlans.id });
      if (!deleted) throw notFound("Lesson plan not found");
      return { id: deleted.id, deleted: true };
    },
  );

  app.post(
    "/:id/units/:unitId/plans/:planId/attachments",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request) => {
      const { unitId, planId } = planParams.parse(request.params);
      const body = attachmentSchema.parse(request.body);
      await assertPlanEditable(app, request.user, unitId, planId);
      const [plan] = await app.db.select().from(lessonPlans).where(and(eq(lessonPlans.id, planId), eq(lessonPlans.unitId, unitId))).limit(1);
      if (!plan) throw notFound("Lesson plan not found");
      await app.db.insert(attachments).values({ ...body, uploadedBy: request.user.sub }).onConflictDoNothing();
      const ids = plan.attachmentIds.includes(body.id) ? plan.attachmentIds : [...plan.attachmentIds, body.id];
      const [updated] = await app.db.update(lessonPlans).set({ attachmentIds: ids, updatedAt: new Date() }).where(eq(lessonPlans.id, planId)).returning();
      return updated;
    },
  );

  app.delete(
    "/:id/units/:unitId/plans/:planId/attachments/:attachmentId",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request) => {
      const { unitId, planId, attachmentId } = attachmentParams.parse(request.params);
      await assertPlanEditable(app, request.user, unitId, planId);
      const [plan] = await app.db.select().from(lessonPlans).where(and(eq(lessonPlans.id, planId), eq(lessonPlans.unitId, unitId))).limit(1);
      if (!plan) throw notFound("Lesson plan not found");
      const [updated] = await app.db.update(lessonPlans).set({ attachmentIds: plan.attachmentIds.filter((id) => id !== attachmentId), updatedAt: new Date() }).where(eq(lessonPlans.id, planId)).returning();
      return updated;
    },
  );
};
