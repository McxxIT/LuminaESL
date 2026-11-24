import type { FastifyPluginAsync } from "fastify";
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { studentProfiles, users, type User } from "../db/schema";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { parsePagination } from "../lib/pagination";
import {
  assertCanViewUser,
  managerOwnsStudent,
  managerTeam,
} from "../lib/scope";

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  managerId: z.string().uuid().optional(),
  level: z.string().trim().max(60).optional(),
  status: z.enum(["active", "paused", "archived", "invited"]).optional(),
});

const updateStudentSchema = z.object({
  managerId: z.string().uuid().nullable().optional(),
  level: z.string().trim().min(1).max(60).optional(),
  targetLevel: z.string().trim().min(1).max(60).optional(),
  goal: z.string().trim().max(2000).optional(),
  guardianName: z.string().trim().max(120).nullable().optional(),
  guardianEmail: z.string().trim().email().nullable().optional(),
  guardianPhone: z.string().trim().max(40).nullable().optional(),
  guardianRelationship: z.string().trim().max(60).nullable().optional(),
});

const userIdParams = z.object({ id: z.string().uuid() });

function toStudent(
  row: {
    profileId: string;
    userId: string;
    managerId: string | null;
    level: string;
    targetLevel: string;
    goal: string;
    guardianName: string | null;
    guardianEmail: string | null;
    guardianPhone: string | null;
    guardianRelationship: string | null;
    name: string;
    email: string;
    status: User["status"];
    avatarColor: string;
  },
) {
  return {
    id: row.userId,
    profileId: row.profileId,
    userId: row.userId,
    managerId: row.managerId,
    name: row.name,
    email: row.email,
    status: row.status,
    avatarColor: row.avatarColor,
    level: row.level,
    targetLevel: row.targetLevel,
    goal: row.goal,
    guardian: row.guardianName
      ? {
          name: row.guardianName,
          email: row.guardianEmail ?? "",
          phone: row.guardianPhone ?? undefined,
          relationship: row.guardianRelationship ?? undefined,
        }
      : undefined,
  };
}

const studentColumns = {
  profileId: studentProfiles.id,
  userId: studentProfiles.userId,
  managerId: studentProfiles.managerId,
  level: studentProfiles.level,
  targetLevel: studentProfiles.targetLevel,
  goal: studentProfiles.goal,
  guardianName: studentProfiles.guardianName,
  guardianEmail: studentProfiles.guardianEmail,
  guardianPhone: studentProfiles.guardianPhone,
  guardianRelationship: studentProfiles.guardianRelationship,
  name: users.name,
  email: users.email,
  status: users.status,
  avatarColor: users.avatarColor,
};

export const studentRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: app.authenticate },
    async (request) => {
      const query = listQuerySchema.parse(request.query);
      const { limit, offset } = parsePagination(request.query);
      const conditions: SQL[] = [];

      if (query.q) {
        const term = `%${query.q}%`;
        const search = or(
          ilike(users.name, term),
          ilike(users.email, term),
        );
        if (search) conditions.push(search);
      }
      if (query.managerId) {
        conditions.push(eq(studentProfiles.managerId, query.managerId));
      }
      if (query.level) {
        conditions.push(eq(studentProfiles.level, query.level));
      }
      if (query.status) conditions.push(eq(users.status, query.status));

      if (request.user.role === "student") {
        conditions.push(eq(studentProfiles.userId, request.user.sub));
      } else if (request.user.role === "manager") {
        const team = await managerTeam(app.db, request.user.sub);
        const visibleIds = [
          ...new Set([request.user.sub, ...team.studentIds]),
        ];
        conditions.push(
          or(
            eq(studentProfiles.managerId, request.user.sub),
            inArray(studentProfiles.userId, visibleIds),
          )!,
        );
      }

      const where = conditions.length ? and(...conditions) : undefined;

      const items = await app.db
        .select(studentColumns)
        .from(studentProfiles)
        .innerJoin(users, eq(users.id, studentProfiles.userId))
        .where(where)
        .orderBy(asc(users.name))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await app.db
        .select({ value: sql<number>`count(*)::int` })
        .from(studentProfiles)
        .innerJoin(users, eq(users.id, studentProfiles.userId))
        .where(where);

      return {
        items: items.map(toStudent),
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
      const { id } = userIdParams.parse(request.params);
      await assertCanViewUser(app.db, request.user, id);

      const [row] = await app.db
        .select(studentColumns)
        .from(studentProfiles)
        .innerJoin(users, eq(users.id, studentProfiles.userId))
        .where(eq(studentProfiles.userId, id))
        .limit(1);
      if (!row) throw notFound("Student not found");

      return toStudent(row);
    },
  );

  app.patch(
    "/:id",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request) => {
      const { id } = userIdParams.parse(request.params);
      const body = updateStudentSchema.parse(request.body);
      if (Object.keys(body).length === 0) {
        throw badRequest("No fields to update");
      }

      if (
        request.user.role === "manager" &&
        !(await managerOwnsStudent(app.db, request.user.sub, id))
      ) {
        throw forbidden("This student is not on your team");
      }
      if (body.managerId !== undefined && request.user.role !== "admin") {
        throw forbidden("Only admins can reassign a manager");
      }

      const updates: Partial<typeof studentProfiles.$inferInsert> = {};
      if (body.managerId !== undefined) updates.managerId = body.managerId;
      if (body.level !== undefined) updates.level = body.level;
      if (body.targetLevel !== undefined) {
        updates.targetLevel = body.targetLevel;
      }
      if (body.goal !== undefined) updates.goal = body.goal;
      if (body.guardianName !== undefined) {
        updates.guardianName = body.guardianName;
      }
      if (body.guardianEmail !== undefined) {
        updates.guardianEmail = body.guardianEmail;
      }
      if (body.guardianPhone !== undefined) {
        updates.guardianPhone = body.guardianPhone;
      }
      if (body.guardianRelationship !== undefined) {
        updates.guardianRelationship = body.guardianRelationship;
      }

      const [updated] = await app.db
        .update(studentProfiles)
        .set(updates)
        .where(eq(studentProfiles.userId, id))
        .returning();
      if (!updated) throw notFound("Student not found");

      const [row] = await app.db
        .select(studentColumns)
        .from(studentProfiles)
        .innerJoin(users, eq(users.id, studentProfiles.userId))
        .where(eq(studentProfiles.userId, id))
        .limit(1);
      if (!row) throw notFound("Student not found");

      await logActivity(app.db, {
        actorId: request.user.sub,
        action: "student.updated",
        targetType: "user",
        targetId: id,
        summary: row.name,
      });
      if (body.managerId !== undefined) {
        const managerName = body.managerId
          ? (
              await app.db
                .select({ name: users.name })
                .from(users)
                .where(eq(users.id, body.managerId))
                .limit(1)
            )[0]?.name
          : undefined;
        await logActivity(app.db, {
          actorId: request.user.sub,
          action: "student.reassigned",
          targetType: "user",
          targetId: id,
          summary: `Moved to ${managerName ?? "no manager"}`,
        });
      }

      return toStudent(row);
    },
  );
};
