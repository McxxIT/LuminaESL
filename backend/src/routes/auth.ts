import { createHash, randomBytes } from "node:crypto";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  refreshTokens,
  studentProfiles,
  teacherProfiles,
  users,
  type User,
} from "../db/schema";
import { logActivity } from "../lib/activity";
import { AppError, conflict, unauthorized } from "../lib/errors";
import {
  consumeInvite,
  findInviteUserId,
  lockUserForInvite,
} from "../lib/invites";
import {
  changePasswordSchema,
  hashPassword,
  passwordSchema,
  verifyPassword,
} from "../lib/password";
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  pruneRefreshTokens,
  refreshCookieOptions,
  revokeUserRefreshTokens,
} from "../lib/refresh-tokens";
import { hashToken } from "../lib/tokens";

/** The global refresh-token sweep (a table scan) runs at most this often. */
const GLOBAL_PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastGlobalPruneAt = 0;

/** User-controlled limiter key parts are truncated to this length before hashing. */
const MAX_KEY_PART = 256;

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: passwordSchema,
  avatarColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

/** Body for `POST /auth/set-password`; the raw token comes from the link fragment. */
const setPasswordSchema = z
  .object({
    token: z.string().min(20).max(128),
    password: passwordSchema,
  })
  .strict();

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
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
  };
}

/** Short, fixed-length digest of a user-controlled value for limiter keys. */
function keyDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function requestIp(request: FastifyRequest): string {
  return typeof request.ip === "string" && request.ip ? request.ip : "unknown";
}

/**
 * Limiter keys. Each generator is total: it never throws whatever the body,
 * cookie, or token state, and user-controlled parts are capped and hashed.
 */
export function loginRateLimitKey(request: FastifyRequest): string {
  const body: unknown = request.body;
  let email = "";
  if (typeof body === "object" && body !== null && "email" in body) {
    const raw = (body as { email?: unknown }).email;
    if (typeof raw === "string") {
      email = raw.slice(0, MAX_KEY_PART).trim().toLowerCase();
    }
  }
  return `auth-login:${requestIp(request)}:${keyDigest(email)}`;
}

export function refreshRateLimitKey(request: FastifyRequest): string {
  const cookies: unknown = request.cookies;
  let token = "";
  if (typeof cookies === "object" && cookies !== null) {
    const raw = (cookies as Record<string, unknown>)[REFRESH_COOKIE];
    if (typeof raw === "string") token = raw.slice(0, MAX_KEY_PART);
  }
  return `auth-refresh:${requestIp(request)}:${keyDigest(token).slice(0, 16)}`;
}

export function changePasswordRateLimitKey(request: FastifyRequest): string {
  const user: unknown = (request as { user?: unknown }).user;
  let sub = "";
  if (typeof user === "object" && user !== null && "sub" in user) {
    const raw = (user as { sub?: unknown }).sub;
    if (typeof raw === "string") sub = raw.slice(0, MAX_KEY_PART);
  }
  return `auth-change-password:${requestIp(request)}:${keyDigest(sub)}`;
}

export function setPasswordRateLimitKey(request: FastifyRequest): string {
  return `auth-set-password:${requestIp(request)}`;
}

/** One answer for unknown, used, expired and archived-user tokens (no oracle). */
function invalidInviteToken(): AppError {
  return new AppError(
    400,
    "INVALID_OR_EXPIRED_TOKEN",
    "This invitation link is invalid or has expired",
  );
}

async function issueSession(
  app: FastifyInstance,
  reply: FastifyReply,
  user: User,
) {
  const accessToken = app.jwt.sign({
    sub: user.id,
    role: user.role,
    email: user.email,
  });

  const refreshToken = randomBytes(48).toString("base64url");
  const expiresAt = new Date(
    Date.now() + app.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  );

  await app.db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt,
  });

  reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(app.config));

  return { accessToken, user: publicUser(user) };
}

/**
 * Best-effort refresh-token hygiene: the per-user prune is awaited but can never
 * fail the request; the global sweep is throttled and fire-and-forget.
 */
async function pruneAfterAuth(
  app: FastifyInstance,
  request: FastifyRequest,
  userId: string,
  options: { globalSweep: boolean },
): Promise<void> {
  try {
    await pruneRefreshTokens(app.db, { userId });
  } catch (error) {
    request.log.warn({ err: error }, "refresh-token prune failed");
  }
  if (!options.globalSweep) return;
  const now = Date.now();
  if (now - lastGlobalPruneAt < GLOBAL_PRUNE_INTERVAL_MS) return;
  lastGlobalPruneAt = now;
  pruneRefreshTokens(app.db).catch((error: unknown) => {
    app.log.warn({ err: error }, "global refresh-token sweep failed");
  });
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  /**
   * A route-level `config.rateLimit` replaces the global limiter on that route,
   * so the coarse per-IP ceiling (RATE_LIMIT_MAX) is re-applied manually. It is
   * deliberately not a second route limiter: the plugin's per-request "already
   * ran" flag would make that a silent no-op.
   */
  const ipCeiling = app.createRateLimit({
    max: app.config.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
  });
  const enforceIpCeiling = async (request: FastifyRequest) => {
    const result = await ipCeiling(request);
    if (!result.isAllowed && result.isExceeded) {
      throw new AppError(
        429,
        "RATE_LIMITED",
        `Rate limit exceeded, retry in ${result.ttlInSeconds} seconds`,
      );
    }
  };

  const authRateLimit = (
    keyGenerator: (request: FastifyRequest) => string,
  ) => ({
    max: app.config.AUTH_RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    // preHandler, not the default onRequest: by then the body is parsed and the
    // access token verified, so body- and user-based keys are populated.
    hook: "preHandler" as const,
    keyGenerator,
  });

  app.post("/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);

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
        role: "student",
        name: body.name,
        email: body.email,
        passwordHash,
        avatarColor: body.avatarColor ?? "#6366f1",
      })
      .returning();
    if (!user) throw new Error("Failed to create user");

    await app.db.insert(studentProfiles).values({ userId: user.id });

    reply.status(201);
    return issueSession(app, reply, user);
  });

  app.post(
    "/login",
    {
      preHandler: enforceIpCeiling,
      config: { rateLimit: authRateLimit(loginRateLimitKey) },
    },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);

      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.email, body.email))
        .limit(1);

      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        throw unauthorized("Invalid email or password");
      }
      if (user.status !== "active") {
        throw unauthorized("This account is not active");
      }

      await pruneAfterAuth(app, request, user.id, { globalSweep: true });
      return issueSession(app, reply, user);
    },
  );

  app.post(
    "/set-password",
    {
      preHandler: enforceIpCeiling,
      config: { rateLimit: authRateLimit(setPasswordRateLimitKey) },
    },
    async (request, reply) => {
      // Parse first: a policy-invalid password never consumes the token.
      const body = setPasswordSchema.parse(request.body);
      const passwordHash = await hashPassword(body.password);
      const now = new Date();

      await app.db.transaction(async (tx) => {
        // Lock order matches resend/pause/archive/delete: user row, then token.
        const userId = await findInviteUserId(tx, body.token);
        if (!userId) throw invalidInviteToken();
        const locked = await lockUserForInvite(tx, userId);
        if (!locked) throw invalidInviteToken();
        if (!(await consumeInvite(tx, body.token, userId, now))) {
          throw invalidInviteToken();
        }
        const [activated] = await tx
          .update(users)
          .set({ passwordHash, status: "active", updatedAt: now })
          .where(and(eq(users.id, userId), eq(users.status, "invited")))
          .returning({ id: users.id, name: users.name });
        // Paused/archived since the invite: roll back, token stays unconsumed.
        if (!activated) throw invalidInviteToken();
        await revokeUserRefreshTokens(tx, activated.id);
        await logActivity(tx, {
          actorId: activated.id,
          action: "user.invite_accepted",
          targetType: "user",
          targetId: activated.id,
          summary: activated.name,
        });
      });

      // No session: the person signs in normally next.
      return reply.status(204).send();
    },
  );

  app.post(
    "/refresh",
    {
      preHandler: enforceIpCeiling,
      config: { rateLimit: authRateLimit(refreshRateLimitKey) },
    },
    async (request, reply) => {
      const rawToken = request.cookies[REFRESH_COOKIE];
      if (!rawToken) throw unauthorized("Missing refresh token");

      const [stored] = await app.db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hashToken(rawToken)))
        .limit(1);

      if (
        !stored ||
        stored.revokedAt ||
        stored.expiresAt.getTime() <= Date.now()
      ) {
        throw unauthorized("Refresh token is invalid or expired");
      }

      await app.db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.id, stored.id));

      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, stored.userId))
        .limit(1);

      // Primary gate for paused/archived accounts. Revoking their tokens on a
      // status change (users.ts) is defense in depth, not the gate.
      if (!user || user.status !== "active") {
        throw unauthorized("This account is not active");
      }

      await pruneAfterAuth(app, request, user.id, { globalSweep: false });
      return issueSession(app, reply, user);
    },
  );

  app.post(
    "/change-password",
    {
      preHandler: [enforceIpCeiling, app.authenticate],
      config: { rateLimit: authRateLimit(changePasswordRateLimitKey) },
    },
    async (request, reply) => {
      const body = changePasswordSchema.parse(request.body);

      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, request.user.sub))
        .limit(1);
      if (!user || user.status !== "active") {
        throw unauthorized("This account is not active");
      }

      // 400, never 401: the client retries any 401 through /auth/refresh, which
      // would rotate tokens needlessly. The session is valid; the field is wrong.
      if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
        throw new AppError(
          400,
          "INVALID_CURRENT_PASSWORD",
          "Current password is incorrect",
        );
      }

      const passwordHash = await hashPassword(body.newPassword);
      const updated = await app.db.transaction(async (tx) => {
        const [row] = await tx
          .update(users)
          .set({ passwordHash, updatedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning();
        await revokeUserRefreshTokens(tx, user.id);
        return row;
      });
      if (!updated) throw unauthorized("Account no longer exists");

      // Fresh cookie for this device; every other device must sign in again.
      await issueSession(app, reply, updated);
      await logActivity(app.db, {
        actorId: user.id,
        action: "user.password_changed",
        targetType: "user",
        targetId: user.id,
        summary: user.name,
      });

      return { success: true };
    },
  );

  app.post("/logout", async (request, reply) => {
    const rawToken = request.cookies[REFRESH_COOKIE];
    if (rawToken) {
      await app.db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, hashToken(rawToken)));
    }
    reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return { success: true };
  });

  app.get(
    "/me",
    { preHandler: app.authenticate },
    async (request) => {
      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, request.user.sub))
        .limit(1);
      if (!user) throw unauthorized("Account no longer exists");

      let profile: unknown = null;
      if (user.role === "teacher") {
        const [teacher] = await app.db
          .select()
          .from(teacherProfiles)
          .where(eq(teacherProfiles.userId, user.id))
          .limit(1);
        profile = teacher ?? null;
      } else if (user.role === "student") {
        const [student] = await app.db
          .select()
          .from(studentProfiles)
          .where(eq(studentProfiles.userId, user.id))
          .limit(1);
        profile = student ?? null;
      }

      return { user: publicUser(user), profile };
    },
  );
};
