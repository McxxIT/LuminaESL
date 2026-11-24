import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import type { Env } from "../src/config/env";
import {
  REFRESH_COOKIE_PATH,
  refreshCookieOptions,
} from "../src/lib/refresh-tokens";
import {
  changePasswordRateLimitKey,
  loginRateLimitKey,
  refreshRateLimitKey,
} from "../src/routes/auth";

/**
 * Auth lifecycle checks that need no database: refresh-cookie attributes and the
 * per-route auth limiter. Limiter requests use invalid bodies, so each request
 * passes the limiter (preHandler) and then fails Zod validation in the handler
 * with a 400 before any query runs.
 */

const baseEnv: Env = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 0,
  LOG_LEVEL: "error",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/lumina_test",
  JWT_SECRET: "test-secret-that-is-long-enough-to-pass",
  ACCESS_TOKEN_TTL: "15m",
  REFRESH_TOKEN_TTL_DAYS: 30,
  CORS_ORIGIN: "http://localhost:3000",
  UPLOAD_DIR: "uploads",
  RATE_LIMIT_MAX: 300,
  AUTH_RATE_LIMIT_MAX: 30,
};

describe("refreshCookieOptions", () => {
  it("should build refresh cookie options with secure only in production", () => {
    const dev = refreshCookieOptions({ NODE_ENV: "development", REFRESH_TOKEN_TTL_DAYS: 30 });
    expect(dev).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/api/v1/auth",
      maxAge: 30 * 86_400,
    });
    expect(REFRESH_COOKIE_PATH).toBe("/api/v1/auth");
    expect(refreshCookieOptions({ NODE_ENV: "test", REFRESH_TOKEN_TTL_DAYS: 7 }).secure).toBe(false);
    const prod = refreshCookieOptions({ NODE_ENV: "production", REFRESH_TOKEN_TTL_DAYS: 7 });
    expect(prod.secure).toBe(true);
    expect(prod.httpOnly).toBe(true);
    expect(prod.sameSite).toBe("lax");
    expect(prod.maxAge).toBe(7 * 86_400);
  });
});

describe("auth limiter key generators", () => {
  const fake = (parts: Record<string, unknown>) =>
    parts as unknown as Parameters<typeof loginRateLimitKey>[0];

  it("should never throw on missing or malformed inputs", () => {
    for (const request of [
      fake({}),
      fake({ ip: "1.2.3.4", body: null }),
      fake({ ip: "1.2.3.4", body: "text" }),
      fake({ ip: "1.2.3.4", body: { email: 42 } }),
      fake({ ip: "1.2.3.4", cookies: null, user: "x" }),
      fake({ ip: "1.2.3.4", cookies: { refresh_token: ["a"] }, user: { sub: 7 } }),
    ]) {
      expect(() => loginRateLimitKey(request)).not.toThrow();
      expect(() => refreshRateLimitKey(request)).not.toThrow();
      expect(() => changePasswordRateLimitKey(request)).not.toThrow();
    }
  });

  it("should normalize and hash the email so keys stay short and case-insensitive", () => {
    const a = loginRateLimitKey(fake({ ip: "1.2.3.4", body: { email: "  Ana@School.TEST " } }));
    const b = loginRateLimitKey(fake({ ip: "1.2.3.4", body: { email: "ana@school.test" } }));
    const huge = loginRateLimitKey(fake({ ip: "1.2.3.4", body: { email: "x".repeat(100_000) } }));
    expect(a).toBe(b);
    expect(a).not.toContain("ana");
    expect(huge.length).toBeLessThan(100);
  });
});

describe("auth rate limits", () => {
  let perAccount: FastifyInstance;
  let perIp: FastifyInstance;

  beforeAll(async () => {
    perAccount = await buildApp({ env: { ...baseEnv, AUTH_RATE_LIMIT_MAX: 3, RATE_LIMIT_MAX: 1000 } });
    perIp = await buildApp({ env: { ...baseEnv, AUTH_RATE_LIMIT_MAX: 1000, RATE_LIMIT_MAX: 4 } });
    await perAccount.ready();
    await perIp.ready();
  });

  afterAll(async () => {
    await perAccount.close();
    await perIp.close();
  });

  const login = (app: FastifyInstance, email: string) =>
    app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password: "" } });

  it("should return 429 after the auth cap with per-email buckets and a per-IP ceiling", async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await login(perAccount, "first-not-an-email")).statusCode).toBe(400);
    }
    const tripped = await login(perAccount, "first-not-an-email");
    expect(tripped.statusCode).toBe(429);

    // A different email has its own bucket on the same IP.
    expect((await login(perAccount, "second-not-an-email")).statusCode).toBe(400);
    // Email keys are normalized, so case changes do not open a new bucket.
    expect((await login(perAccount, "FIRST-NOT-AN-EMAIL")).statusCode).toBe(429);

    // Rotating emails cannot evade the coarse per-IP ceiling.
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await login(perIp, `rotating-${i}-not-an-email`)).statusCode);
    }
    expect(statuses.slice(0, 4)).toEqual([400, 400, 400, 400]);
    expect(statuses.slice(4)).toEqual([429, 429]);
  });

  it("should key change-password by user.sub after the token is verified", async () => {
    const tokenFor = (sub: string) =>
      perAccount.jwt.sign({ sub, role: "student", email: `${sub.slice(-4)}@example.test` });
    const change = (token: string) =>
      perAccount.inject({
        method: "POST",
        url: "/api/v1/auth/change-password",
        headers: { authorization: `Bearer ${token}` },
        payload: { currentPassword: "" },
      });

    const alice = tokenFor("00000000-0000-0000-0000-00000000a11c");
    const bob = tokenFor("00000000-0000-0000-0000-000000000b0b");
    for (let i = 0; i < 3; i += 1) {
      expect((await change(alice)).statusCode).toBe(400);
    }
    expect((await change(alice)).statusCode).toBe(429);
    // Same IP, different account: separate bucket.
    expect((await change(bob)).statusCode).toBe(400);

    // Anonymous calls fail authentication before the limiter and do not count.
    const anonymous = await perAccount.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      payload: {},
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it("should limit refresh by cookie without touching the database", async () => {
    const refresh = (cookie?: string) =>
      perAccount.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        ...(cookie ? { cookies: { refresh_token: cookie } } : {}),
      });
    // No cookie: rejected 401 by the handler before any query.
    for (let i = 0; i < 3; i += 1) {
      expect((await refresh()).statusCode).toBe(401);
    }
    expect((await refresh()).statusCode).toBe(429);
  });
});
