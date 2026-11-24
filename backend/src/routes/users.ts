import type { FastifyPluginAsync } from "fastify";
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  enrollments,
  studentProfiles,
  teacherProfiles,
  users,
  type User,
} from "../db/schema";
import type { DbOrTx } from "../lib/db-handle";
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  isUniqueViolation,
  notFound,
} from "../lib/errors";
import { logActivity } from "../lib/activity";
import {
  deliverInvite,
  expireOpenInvites,
  issueInvite,
  lockUserForInvite,
  resolveInviteCooldown,
  type InviteOutcome,
} from "../lib/invites";
import { parsePagination } from "../lib/pagination";
import {
  hashPassword,
  isUnusablePasswordHash,
  passwordSchema,
  resetPasswordSchema,
  unusablePasswordHash,
} from "../lib/password";
import { revokeUserRefreshTokens } from "../lib/refresh-tokens";
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
  status: z.enum(["active", "paused", "archived", "invited"]).optional(),
});

const idParams = z.object({ id: z.string().uuid() });

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  /** Admin-only. Without it the account is created `invited` and emailed a link. */
  password: passwordSchema.optional(),
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

const NOT_ACTIVATED_MESSAGE =
  "This account has not been activated yet; send an invitation instead";

function notActivated(): AppError {
  return new AppError(409, "ACCOUNT_NOT_ACTIVATED", NOT_ACTIVATED_MESSAGE);
}

export type NewAccountInput = {
  actorId: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "teacher" | "student";
  avatarColor: string;
  managerId: string | null;
  /** A scrypt hash (active account) or `unusablePasswordHash()` (invited). */
  passwordHash: string;
  invited: boolean;
  now: Date;
};

/**
 * Every write of `POST /users` in the caller's transaction: duplicate check,
 * user, profile (with `managerId`), invite token, activity row. A failure at
 * any step throws and rolls the whole account back. Returns the raw invite
 * token (null for an active account). Exported for the smoke rollback check.
 */
export async function insertAccount(
  tx: DbOrTx,
  input: NewAccountInput,
): Promise<{ user: User; token: string | null }> {
  const [existing] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing) throw conflict("Email is already registered");

  const [user] = await tx
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      status: input.invited ? "invited" : "active",
      avatarColor: input.avatarColor,
    })
    .returning();
  if (!user) throw new Error("Failed to create user");

  if (input.role === "teacher") {
    await tx.insert(teacherProfiles).values({
      userId: user.id,
      managerId: input.managerId,
      hireDate: input.now.toISOString().slice(0, 10),
    });
  } else if (input.role === "student") {
    await tx.insert(studentProfiles).values({
      userId: user.id,
      managerId: input.managerId,
    });
  }

  const token = input.invited
    ? await issueInvite(tx, user.id, { now: input.now, cooldownSeconds: 0 })
    : null;

  await logActivity(tx, {
    actorId: input.actorId,
    action: input.role === "admin" ? "user.created" : `${input.role}.created`,
    targetType: "user",
    targetId: user.id,
    summary: user.name,
  });

  return { user, token };
}

/**
 * Manager ownership read inside the caller's transaction (after the row lock),
 * same rule as `managerOwnsTeacher` / `managerOwnsStudent` in lib/scope.ts.
 */
async function managerOwnsInTx(
  tx: DbOrTx,
  managerId: string,
  target: Pick<User, "id" | "role">,
): Promise<boolean> {
  if (target.role === "teacher") {
    const [profile] = await tx
      .select({ managerId: teacherProfiles.managerId })
      .from(teacherProfiles)
      .where(eq(teacherProfiles.userId, target.id))
      .limit(1);
    return profile?.managerId === managerId;
  }
  if (target.role === "student") {
    const [profile] = await tx
      .select({ managerId: studentProfiles.managerId })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, target.id))
      .limit(1);
    if (profile?.managerId === managerId) return true;
    const [enrolled] = await tx
      .select({ id: enrollments.id })
      .from(enrollments)
      .innerJoin(teacherProfiles, eq(teacherProfiles.userId, enrollments.teacherId))
      .where(
        and(
          eq(enrollments.studentId, target.id),
          eq(teacherProfiles.managerId, managerId),
        ),
      )
      .limit(1);
    return Boolean(enrolled);
  }
  return false;
}

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
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request, reply) => {
      const body = createUserSchema.parse(request.body);
      const actor = request.user;

      let managerId: string | null = null;
      if (actor.role === "manager") {
        if (body.role !== "teacher" && body.role !== "student") {
          throw forbidden("Managers can only create teachers and students");
        }
        if (body.password !== undefined) {
          throw forbidden("Managers cannot set a password; the person sets it from the invitation");
        }
        if (body.managerId !== undefined && body.managerId !== actor.sub) {
          throw forbidden("Managers can only add people to their own team");
        }
        managerId = actor.sub;
      } else if (body.role === "teacher" || body.role === "student") {
        managerId = body.managerId ?? null;
      }

      const invited = body.password === undefined;
      const passwordHash = invited
        ? unusablePasswordHash()
        : await hashPassword(body.password as string);
      const now = new Date();

      const created = await app.db.transaction(async (tx) => {
        try {
          if (actor.role === "admin" && body.managerId !== undefined) {
            const [manager] = await tx
              .select({ role: users.role })
              .from(users)
              .where(eq(users.id, body.managerId))
              .limit(1);
            if (manager?.role !== "manager") {
              throw badRequest("managerId must reference a manager");
            }
          }
          return await insertAccount(tx, {
            actorId: actor.sub,
            name: body.name,
            email: body.email,
            role: body.role,
            avatarColor: body.avatarColor ?? "#6366f1",
            managerId,
            passwordHash,
            invited,
            now,
          });
        } catch (error) {
          if (isUniqueViolation(error)) throw conflict("Email is already registered");
          throw error;
        }
      });

      reply.status(201);
      if (!created.token) return publicUser(created.user);

      // Mail only after the transaction committed.
      const invite: InviteOutcome = await deliverInvite({
        mailer: app.mailer,
        env: app.config,
        log: request.log,
        user: created.user,
        token: created.token,
        actorRole: actor.role,
      });
      return { ...publicUser(created.user), invite };
    },
  );

  app.post(
    "/:id/invite",
    { preHandler: app.requireRole(["admin", "manager"]) },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const actor = request.user;
      const now = new Date();
      const cooldownSeconds = resolveInviteCooldown(app.config);

      const issued = await app.db.transaction(async (tx) => {
        // 1. Row lock first; 2. role/status/ownership from this transaction.
        const target = await lockUserForInvite(tx, id);
        if (actor.role === "manager") {
          // 403 for unknown, out-of-team and non-teacher/student targets alike:
          // no existence oracle for managers.
          if (!target || !(await managerOwnsInTx(tx, actor.sub, target))) {
            throw forbidden();
          }
        } else if (!target) {
          throw notFound("User not found");
        }
        // 3. status + cooldown, 4. expire open invites, 5. insert.
        const token = await issueInvite(tx, id, { now, cooldownSeconds });
        await logActivity(tx, {
          actorId: actor.sub,
          action: "user.invite_resent",
          targetType: "user",
          targetId: target.id,
          summary: target.name,
        });
        return { target, token };
      });

      const invite = await deliverInvite({
        mailer: app.mailer,
        env: app.config,
        log: request.log,
        user: issued.target,
        token: issued.token,
        actorRole: actor.role,
      });
      return { invite };
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

      const [before] = await app.db
        .select({
          name: users.name,
          status: users.status,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!before) throw notFound("User not found");
      // A never-activated account (unusable hash) cannot be made active or
      // paused by any path; it must accept an invitation instead.
      if (
        (body.status === "active" || body.status === "paused") &&
        isUnusablePasswordHash(before.passwordHash)
      ) {
        throw notActivated();
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

      const updated = await app.db.transaction(async (tx) => {
        const [row] = await tx
          .update(users)
          .set(updates)
          .where(eq(users.id, id))
          .returning();
        if (!row) throw notFound("User not found");
        const emailChangedWhileInvited =
          body.email !== undefined && row.status === "invited";
        if (
          emailChangedWhileInvited ||
          body.status === "archived" ||
          body.status === "paused"
        ) {
          await expireOpenInvites(tx, row.id, new Date());
        }
        return row;
      });

      const newStatus = body.status;
      const statusChanged =
        newStatus !== undefined && before.status !== updated.status;
      if (statusChanged && before.status === "active") {
        // Defense in depth: /auth/refresh already rejects inactive accounts.
        await revokeUserRefreshTokens(app.db, updated.id);
      }
      if (statusChanged && newStatus !== undefined) {
        await logActivity(app.db, {
          actorId: request.user.sub,
          action: `user.${newStatus}`,
          targetType: "user",
          targetId: updated.id,
          summary: updated.name,
        });
      }
      if (body.name !== undefined && before.name !== updated.name) {
        await logActivity(app.db, {
          actorId: request.user.sub,
          action: "user.renamed",
          targetType: "user",
          targetId: updated.id,
          summary: `${before.name} → ${updated.name}`,
        });
      } else if (
        !statusChanged &&
        (body.email !== undefined || body.avatarColor !== undefined)
      ) {
        await logActivity(app.db, {
          actorId: request.user.sub,
          action: "user.updated",
          targetType: "user",
          targetId: updated.id,
          summary: `${updated.name} (${Object.keys(body).join(", ")})`,
        });
      }

      return publicUser(updated);
    },
  );

  app.post(
    "/:id/reset-password",
    { preHandler: app.requireRole("admin") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = resetPasswordSchema.parse(request.body);
      if (request.user.sub === id) {
        throw badRequest(
          "You cannot reset your own password — use the change-password flow",
        );
      }

      const [target] = await app.db
        .select({
          id: users.id,
          name: users.name,
          status: users.status,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!target) throw notFound("User not found");
      if (target.status === "invited" || isUnusablePasswordHash(target.passwordHash)) {
        throw conflict(NOT_ACTIVATED_MESSAGE);
      }

      const passwordHash = await hashPassword(body.newPassword);
      await app.db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ passwordHash, updatedAt: new Date() })
          .where(eq(users.id, target.id));
        await revokeUserRefreshTokens(tx, target.id);
      });

      await logActivity(app.db, {
        actorId: request.user.sub,
        action: "user.password_reset",
        targetType: "user",
        targetId: target.id,
        summary: target.name,
      });

      // Never echo the password back.
      return { id: target.id, success: true };
    },
  );

  app.delete(
    "/:id",
    { preHandler: app.requireRole("admin") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const archived = await app.db.transaction(async (tx) => {
        const [row] = await tx
          .update(users)
          .set({ status: "archived", updatedAt: new Date() })
          .where(eq(users.id, id))
          .returning({ id: users.id, status: users.status, name: users.name });
        if (!row) throw notFound("User not found");
        await expireOpenInvites(tx, row.id, new Date());
        await revokeUserRefreshTokens(tx, row.id);
        return row;
      });

      await logActivity(app.db, {
        actorId: request.user.sub,
        action: "user.archived",
        targetType: "user",
        targetId: archived.id,
        summary: archived.name,
      });

      return { id: archived.id, status: archived.status };
    },
  );
};
