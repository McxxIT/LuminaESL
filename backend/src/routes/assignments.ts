import type { FastifyPluginAsync } from "fastify";
import { and, asc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { activity, assignments, users } from "../db/schema";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { parsePagination } from "../lib/pagination";
import {
  managerOwnsStudent,
  managerOwnsTeacher,
  managerTeam,
} from "../lib/scope";

const idParams = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  status: z.enum(["assigned", "submitted", "reviewed"]).optional(),
  type: z.enum(["recording", "quiz", "reading", "writing"]).optional(),
});

const createAssignmentSchema = z.object({
  teacherId: z.string().uuid().optional(),
  studentId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  type: z.enum(["recording", "quiz", "reading", "writing"]),
  description: z.string().trim().max(4000).optional(),
  instructions: z.string().trim().max(4000).optional(),
  dueLabel: z.string().trim().min(1).max(120),
});

const submitAssignmentSchema = z.object({
  response: z.string().trim().min(1).max(8000),
});

const reviewAssignmentSchema = z.object({
  feedback: z.string().trim().max(4000).optional(),
  grade: z.string().trim().max(40).optional(),
});

export const assignmentRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: app.authenticate },
    async (request) => {
      const query = listQuerySchema.parse(request.query);
      const { limit, offset } = parsePagination(request.query);
      const conditions: SQL[] = [];

      if (query.studentId) {
        conditions.push(eq(assignments.studentId, query.studentId));
      }
      if (query.teacherId) {
        conditions.push(eq(assignments.teacherId, query.teacherId));
      }
      if (query.status) conditions.push(eq(assignments.status, query.status));
      if (query.type) conditions.push(eq(assignments.type, query.type));

      if (request.user.role === "student") {
        conditions.push(eq(assignments.studentId, request.user.sub));
      } else if (request.user.role === "teacher") {
        conditions.push(eq(assignments.teacherId, request.user.sub));
      } else if (request.user.role === "manager") {
        const team = await managerTeam(app.db, request.user.sub);
        const visibility: SQL[] = [];
        if (team.teacherIds.length) {
          visibility.push(inArray(assignments.teacherId, team.teacherIds));
        }
        if (team.studentIds.length) {
          visibility.push(inArray(assignments.studentId, team.studentIds));
        }
        conditions.push(
          visibility.length ? (or(...visibility) ?? sql`false`) : sql`false`,
        );
      }

      const where = conditions.length ? and(...conditions) : undefined;

      const items = await app.db
        .select()
        .from(assignments)
        .where(where)
        .orderBy(asc(assignments.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await app.db
        .select({ value: sql<number>`count(*)::int` })
        .from(assignments)
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
      const body = createAssignmentSchema.parse(request.body);

      const teacherId =
        request.user.role === "teacher"
          ? request.user.sub
          : body.teacherId;
      if (!teacherId) throw badRequest("teacherId is required");
      if (
        request.user.role === "manager" &&
        !(
          (await managerOwnsTeacher(app.db, request.user.sub, teacherId)) &&
          (await managerOwnsStudent(app.db, request.user.sub, body.studentId))
        )
      ) {
        throw forbidden("You can only assign work within your team");
      }

      const [student] = await app.db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, body.studentId))
        .limit(1);
      if (!student || student.role !== "student") {
        throw badRequest("studentId must belong to a student");
      }

      const [created] = await app.db
        .insert(assignments)
        .values({
          studentId: body.studentId,
          teacherId,
          title: body.title,
          type: body.type,
          description: body.description ?? "",
          instructions: body.instructions ?? "",
          dueLabel: body.dueLabel,
        })
        .returning();
      if (!created) throw new Error("Failed to create assignment");

      await app.db.insert(activity).values({
        actorId: request.user.sub,
        action: "homework.assigned",
        targetType: "assignment",
        targetId: created.id,
        summary: `Assigned "${created.title}"`,
      });

      reply.status(201);
      return created;
    },
  );

  app.post(
    "/:id/submit",
    { preHandler: app.authenticate },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = submitAssignmentSchema.parse(request.body);

      const [existing] = await app.db
        .select()
        .from(assignments)
        .where(eq(assignments.id, id))
        .limit(1);
      if (!existing) throw notFound("Assignment not found");

      const isStaff =
        request.user.role === "admin" || request.user.role === "manager";
      if (!isStaff && existing.studentId !== request.user.sub) {
        throw forbidden("Only the assigned student can submit this work");
      }
      if (existing.status === "reviewed") {
        throw badRequest("This assignment has already been reviewed");
      }

      const [updated] = await app.db
        .update(assignments)
        .set({
          response: body.response,
          status: "submitted",
          submittedAt: new Date(),
        })
        .where(eq(assignments.id, id))
        .returning();
      if (!updated) throw notFound("Assignment not found");

      await app.db.insert(activity).values({
        actorId: request.user.sub,
        action: "homework.submitted",
        targetType: "assignment",
        targetId: id,
        summary: existing.title,
      });

      return updated;
    },
  );

  app.post(
    "/:id/review",
    { preHandler: app.requireRole(["admin", "manager", "teacher"]) },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = reviewAssignmentSchema.parse(request.body);

      const [existing] = await app.db
        .select()
        .from(assignments)
        .where(eq(assignments.id, id))
        .limit(1);
      if (!existing) throw notFound("Assignment not found");
      if (
        request.user.role === "teacher" &&
        existing.teacherId !== request.user.sub
      ) {
        throw forbidden();
      }
      if (
        request.user.role === "manager" &&
        !(await managerOwnsTeacher(app.db, request.user.sub, existing.teacherId))
      ) {
        throw forbidden();
      }

      const [updated] = await app.db
        .update(assignments)
        .set({
          status: "reviewed",
          feedback: body.feedback ?? null,
          grade: body.grade ?? null,
          reviewedAt: new Date(),
        })
        .where(eq(assignments.id, id))
        .returning();
      if (!updated) throw notFound("Assignment not found");

      await app.db.insert(activity).values({
        actorId: request.user.sub,
        action: "homework.reviewed",
        targetType: "assignment",
        targetId: id,
        summary: existing.title,
      });

      return updated;
    },
  );
};
