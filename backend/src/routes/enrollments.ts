import type { FastifyPluginAsync } from "fastify";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  courses,
  enrollments,
  users,
} from "../db/schema";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { parsePagination } from "../lib/pagination";

const idParams = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  status: z
    .enum(["active", "paused", "completed", "ended"])
    .optional(),
});

const createEnrollmentSchema = z.object({
  studentId: z.string().uuid(),
  teacherId: z.string().uuid(),
  courseId: z.string().uuid(),
  nextPlanIndex: z.number().int().min(0).optional(),
});

const updateEnrollmentSchema = z.object({
  nextPlanIndex: z.number().int().min(0).optional(),
  status: z.enum(["active", "paused", "completed", "ended"]).optional(),
});

const enrollmentColumns = {
  id: enrollments.id,
  studentId: enrollments.studentId,
  teacherId: enrollments.teacherId,
  courseId: enrollments.courseId,
  nextPlanIndex: enrollments.nextPlanIndex,
  status: enrollments.status,
  startedAt: enrollments.startedAt,
  courseTitle: courses.title,
  studentName: users.name,
};

export const enrollmentRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: app.authenticate },
    async (request) => {
      const query = listQuerySchema.parse(request.query);
      const { limit, offset } = parsePagination(request.query);
      const conditions: SQL[] = [];

      if (query.studentId) {
        conditions.push(eq(enrollments.studentId, query.studentId));
      }
      if (query.teacherId) {
        conditions.push(eq(enrollments.teacherId, query.teacherId));
      }
      if (query.courseId) {
        conditions.push(eq(enrollments.courseId, query.courseId));
      }
      if (query.status) conditions.push(eq(enrollments.status, query.status));

      if (request.user.role === "student") {
        conditions.push(eq(enrollments.studentId, request.user.sub));
      } else if (request.user.role === "teacher") {
        conditions.push(eq(enrollments.teacherId, request.user.sub));
      }

      const where = conditions.length ? and(...conditions) : undefined;

      const items = await app.db
        .select(enrollmentColumns)
        .from(enrollments)
        .innerJoin(users, eq(users.id, enrollments.studentId))
        .innerJoin(courses, eq(courses.id, enrollments.courseId))
        .where(where)
        .orderBy(asc(enrollments.startedAt))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await app.db
        .select({ value: sql<number>`count(*)::int` })
        .from(enrollments)
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
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request, reply) => {
      const body = createEnrollmentSchema.parse(request.body);

      const [course] = await app.db
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.id, body.courseId))
        .limit(1);
      if (!course) throw notFound("Course not found");

      const [enrollment] = await app.db
        .insert(enrollments)
        .values({
          studentId: body.studentId,
          teacherId: body.teacherId,
          courseId: body.courseId,
          nextPlanIndex: body.nextPlanIndex ?? 0,
        })
        .returning();
      if (!enrollment) throw new Error("Failed to create enrollment");

      reply.status(201);
      return enrollment;
    },
  );

  app.patch(
    "/:id",
    { preHandler: app.requireRole(["admin", "manager", "teacher"]) },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = updateEnrollmentSchema.parse(request.body);
      if (Object.keys(body).length === 0) {
        throw badRequest("No fields to update");
      }

      const [existing] = await app.db
        .select()
        .from(enrollments)
        .where(eq(enrollments.id, id))
        .limit(1);
      if (!existing) throw notFound("Enrollment not found");

      if (
        request.user.role === "teacher" &&
        existing.teacherId !== request.user.sub
      ) {
        throw forbidden();
      }

      const [updated] = await app.db
        .update(enrollments)
        .set({
          ...(body.nextPlanIndex !== undefined && {
            nextPlanIndex: body.nextPlanIndex,
          }),
          ...(body.status !== undefined && { status: body.status }),
        })
        .where(eq(enrollments.id, id))
        .returning();
      if (!updated) throw notFound("Enrollment not found");

      return updated;
    },
  );
};
