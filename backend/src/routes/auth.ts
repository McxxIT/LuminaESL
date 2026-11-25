import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  refreshTokens,
  studentProfiles,
  teacherProfiles,
  users,
  type User,
} from "../db/schema";
import { conflict, unauthorized } from "../lib/errors";
import { hashPassword, verifyPassword } from "../lib/password";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  avatarColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

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

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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

  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: app.config.NODE_ENV === "production",
    path: REFRESH_COOKIE_PATH,
    maxAge: app.config.REFRESH_TOKEN_TTL_DAYS * 86_400,
  });

  return { accessToken, user: publicUser(user) };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
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

  app.post("/login", async (request, reply) => {
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

    return issueSession(app, reply, user);
  });

  app.post("/refresh", async (request, reply) => {
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

    if (!user || user.status !== "active") {
      throw unauthorized("This account is not active");
    }

    return issueSession(app, reply, user);
  });

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
