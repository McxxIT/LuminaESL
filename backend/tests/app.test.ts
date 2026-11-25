import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import type { Env } from "../src/config/env";

const env: Env = {
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

describe("Lumina API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ env });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exposes a health check", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
  });

  it("returns a structured 404", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/does-not-exist",
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("rejects protected routes without a token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/lessons",
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("validates request bodies before hitting the database", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "not-an-email", password: "" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });
});
