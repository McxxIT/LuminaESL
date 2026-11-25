import type { FastifyPluginAsync } from "fastify";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { teacherProfiles, users, type User } from "../db/schema.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { logActivity } from "../lib/activity.js";
import { parsePagination } from "../lib/pagination.js";
import { assertCanViewUser, managerOwnsTeacher } from "../lib/scope.js";

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  managerId: z.string().uuid().optional(),
  status: z.enum(["active", "paused", "archived", "invited"]).optional(),
});

const updateTeacherSchema = z.object({
  managerId: z.string().uuid().nullable().optional(),
  headline: z.string().trim().max(160).optional(),
  specializations: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  languages: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  bio: z.string().trim().max(4000).optional(),
  weeklyGoalHours: z.number().int().min(0).max(60).optional(),
});

const userIdParams = z.object({ id: z.string().uuid() });

const teacherColumns = {
  profileId: teacherProfiles.id,
  userId: teacherProfiles.userId,
  managerId: teacherProfiles.managerId,
  headline: teacherProfiles.headline,
  specializations: teacherProfiles.specializations,
  languages: teacherProfiles.languages,
  bio: teacherProfiles.bio,
  hireDate: teacherProfiles.hireDate,
  weeklyGoalHours: teacherProfiles.weeklyGoalHours,
  name: users.name,
  email: users.email,
  status: users.status,
  avatarColor: users.avatarColor,
};

function toTeacher(row: {
  profileId: string;
  userId: string;
  managerId: string | null;
  headline: string;
  specializations: string[];
  languages: string[];
  bio: string;
  hireDate: string;
  weeklyGoalHours: number;
  name: string;
  email: string;
  status: User["status"];
  avatarColor: string;
}) {
  return {
    id: row.userId,
    profileId: row.profileId,
    userId: row.userId,
    managerId: row.managerId,
    name: row.name,
    email: row.email,
    status: row.status,
    avatarColor: row.avatarColor,
    headline: row.headline,
    specializations: row.specializations,
    languages: row.languages,
    bio: row.bio,
    hireDate: row.hireDate,
    weeklyGoalHours: row.weeklyGoalHours,
  };
}

export const teacherRoutes: FastifyPluginAsync = async (app) => {
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
        conditions.push(eq(teacherProfiles.managerId, query.managerId));
      }
      if (query.status) conditions.push(eq(users.status, query.status));

      if (request.user.role === "teacher") {
        conditions.push(eq(teacherProfiles.userId, request.user.sub));
      } else if (request.user.role === "manager") {
        conditions.push(eq(teacherProfiles.managerId, request.user.sub));
      }

      const where = conditions.length ? and(...conditions) : undefined;

      const items = await app.db
        .select(teacherColumns)
        .from(teacherProfiles)
        .innerJoin(users, eq(users.id, teacherProfiles.userId))
        .where(where)
        .orderBy(asc(users.name))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await app.db
        .select({ value: sql<number>`count(*)::int` })
        .from(teacherProfiles)
        .innerJoin(users, eq(users.id, teacherProfiles.userId))
        .where(where);

      return {
        items: items.map(toTeacher),
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
        .select(teacherColumns)
        .from(teacherProfiles)
        .innerJoin(users, eq(users.id, teacherProfiles.userId))
        .where(eq(teacherProfiles.userId, id))
        .limit(1);
      if (!row) throw notFound("Teacher not found");

      return toTeacher(row);
    },
  );

  app.patch(
    "/:id",
    { preHandler: app.authenticate },
    async (request) => {
      const { id } = userIdParams.parse(request.params);
      const body = updateTeacherSchema.parse(request.body);
      if (Object.keys(body).length === 0) {
        throw badRequest("No fields to update");
      }

      const isSelf = request.user.sub === id;
      const isAdmin = request.user.role === "admin";
      const isManager = request.user.role === "manager";
      if (!isSelf && !isAdmin && !isManager) throw forbidden();
      if (
        isManager &&
        !isSelf &&
        !(await managerOwnsTeacher(app.db, request.user.sub, id))
      ) {
        throw forbidden("This teacher is not on your team");
      }

      if (body.managerId !== undefined && !isAdmin) {
        throw forbidden("Only admins can reassign a manager");
      }

      const [updated] = await app.db
        .update(teacherProfiles)
        .set({
          ...(body.managerId !== undefined && { managerId: body.managerId }),
          ...(body.headline !== undefined && { headline: body.headline }),
          ...(body.specializations !== undefined && {
            specializations: body.specializations,
          }),
          ...(body.languages !== undefined && { languages: body.languages }),
          ...(body.bio !== undefined && { bio: body.bio }),
          ...(body.weeklyGoalHours !== undefined && {
            weeklyGoalHours: body.weeklyGoalHours,
          }),
        })
        .where(eq(teacherProfiles.userId, id))
        .returning({ userId: teacherProfiles.userId });
      if (!updated) throw notFound("Teacher not found");

      const [row] = await app.db
        .select(teacherColumns)
        .from(teacherProfiles)
        .innerJoin(users, eq(users.id, teacherProfiles.userId))
        .where(eq(teacherProfiles.userId, id))
        .limit(1);
      if (!row) throw notFound("Teacher not found");

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
          action: "teacher.reassigned",
          targetType: "user",
          targetId: id,
          summary: `Moved to ${managerName ?? "no manager"}`,
        });
      } else {
        await logActivity(app.db, {
          actorId: request.user.sub,
          action: "teacher.updated",
          targetType: "user",
          targetId: id,
          summary: row.name,
        });
      }

      return toTeacher(row);
    },
  );
};
