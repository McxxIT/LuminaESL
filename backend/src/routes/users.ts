import type { FastifyPluginAsync } from "fastify";
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  studentProfiles,
  teacherProfiles,
  users,
  type User,
} from "../db/schema";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { parsePagination } from "../lib/pagination";
import { hashPassword } from "../lib/password";
import {
  assertCanViewUser,
  managerOwnsStudent,
  managerOwnsTeacher,
  managerTeam,
} from "../lib/scope";

const userColumns = {
  id: users.id,
  role: users.role,
  name: users.name,
  email: users.email,
  status: users.status,
  avatarColor: users.avatarColor,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(["admin", "manager", "teacher", "student"]).optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
});

const idParams = z.object({ id: z.string().uuid() });

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "manager", "teacher", "student"]),
  avatarColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  managerId: z.string().uuid().optional(),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  avatarColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
});

function publicUser(user: User) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    status: user.status,
    avatarColor: user.avatarColor,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: app.requireRole(["admin", "manager"]) },
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
      if (query.role) conditions.push(eq(users.role, query.role));
      if (query.status) conditions.push(eq(users.status, query.status));

      if (request.user.role === "manager") {
        const team = await managerTeam(app.db, request.user.sub);
        const visibleIds = [...new Set([request.user.sub, ...team.userIds])];
        conditions.push(inArray(users.id, visibleIds));
      }

      const where = conditions.length ? and(...conditions) : undefined;

      const items = await app.db
        .select(userColumns)
        .from(users)
        .where(where)
        .orderBy(asc(users.name))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await app.db
        .select({ value: sql<number>`count(*)::int` })
        .from(users)
        .where(where);

      return { items, total: totalRow?.value ?? 0, limit, offset };
    },
  );

  app.get(
    "/:id",
    { preHandler: app.authenticate },
    async (request) => {
      const { id } = idParams.parse(request.params);
      await assertCanViewUser(app.db, request.user, id);

      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!user) throw notFound("User not found");

      let profile: unknown = null;
      if (user.role === "teacher") {
        const [row] = await app.db
          .select()
          .from(teacherProfiles)
          .where(eq(teacherProfiles.userId, user.id))
          .limit(1);
        profile = row ?? null;
      } else if (user.role === "student") {
        const [row] = await app.db
          .select()
          .from(studentProfiles)
          .where(eq(studentProfiles.userId, user.id))
          .limit(1);
        profile = row ?? null;
      }

      return { user: publicUser(user), profile };
    },
  );

  app.post(
    "/",
    { preHandler: app.requireRole("admin") },
    async (request, reply) => {
      const body = createUserSchema.parse(request.body);

      const [existing] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, body.email))
        .limit(1);
      if (existing) throw conflict("Email is already registered");

      const passwordHash = await hashPassword(body.password);
      const [user] = await app.db
        .insert(users)
        .values({
          name: body.name,
          email: body.email,
          passwordHash,
          role: body.role,
          avatarColor: body.avatarColor ?? "#6366f1",
        })
        .returning();
      if (!user) throw new Error("Failed to create user");

      if (body.role === "teacher") {
        await app.db.insert(teacherProfiles).values({
          userId: user.id,
          managerId: body.managerId ?? null,
          hireDate: new Date().toISOString().slice(0, 10),
        });
      } else if (body.role === "student") {
        await app.db.insert(studentProfiles).values({
          userId: user.id,
          managerId: body.managerId ?? null,
        });
      }

      reply.status(201);
      return publicUser(user);
    },
  );

  app.patch(
    "/:id",
    { preHandler: app.authenticate },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = updateUserSchema.parse(request.body);

      const isSelf = request.user.sub === id;
      const isAdmin = request.user.role === "admin";
      if (!isSelf && !isAdmin) throw forbidden();
      if (body.status && !isAdmin) {
        const [target] = await app.db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.id, id))
          .limit(1);
        const canManageTeamMember =
          request.user.role === "manager" &&
          target &&
          ((target.role === "teacher" &&
            (await managerOwnsTeacher(app.db, request.user.sub, id))) ||
            (target.role === "student" &&
              (await managerOwnsStudent(app.db, request.user.sub, id))));
        if (!canManageTeamMember) {
          throw forbidden("Only admins can change this account status");
        }
      }
      if (Object.keys(body).length === 0) {
        throw badRequest("No fields to update");
      }

      const updates: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (body.name !== undefined) updates.name = body.name;
      if (body.email !== undefined) {
        const [existing] = await app.db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, body.email), sql`${users.id} <> ${id}`))
          .limit(1);
        if (existing) throw conflict("Email is already registered");
        updates.email = body.email;
      }
      if (body.avatarColor !== undefined) {
        updates.avatarColor = body.avatarColor;
      }
      if (body.status !== undefined) updates.status = body.status;

      const [updated] = await app.db
        .update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning();
      if (!updated) throw notFound("User not found");

      return publicUser(updated);
    },
  );

  app.delete(
    "/:id",
    { preHandler: app.requireRole("admin") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const [archived] = await app.db
        .update(users)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning({ id: users.id, status: users.status });
      if (!archived) throw notFound("User not found");
      return archived;
    },
  );
};
