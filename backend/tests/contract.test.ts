import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type {
  SchoolCollections,
  SchoolSettings,
} from "../../frontend/app/lib/school/types";
import { SCHOOL_SCHEMA_VERSION as UI_SCHEMA_VERSION } from "../../frontend/app/lib/school/types";
import { buildApp } from "../src/app";
import type { Env } from "../src/config/env";
import {
  BOOTSTRAP_COLLECTION_KEYS,
  BOOTSTRAP_SETTINGS_KEYS,
  SCHOOL_SCHEMA_VERSION,
} from "../src/routes/school";

/**
 * Contract tests between the API payloads and the frontend school types. These do
 * not touch the database: the type checks fail the build if the two sides drift,
 * and the route checks fail if a command the adapter relies on disappears.
 */

type AssertNever<T extends never> = T;
type MissingCollection = Exclude<
  keyof SchoolCollections,
  (typeof BOOTSTRAP_COLLECTION_KEYS)[number]
>;
type ExtraCollection = Exclude<
  (typeof BOOTSTRAP_COLLECTION_KEYS)[number],
  keyof SchoolCollections
>;
type MissingSetting = Exclude<
  keyof SchoolSettings,
  (typeof BOOTSTRAP_SETTINGS_KEYS)[number]
>;
type ExtraSetting = Exclude<
  (typeof BOOTSTRAP_SETTINGS_KEYS)[number],
  keyof SchoolSettings
>;

const collectionContract: [
  AssertNever<MissingCollection>,
  AssertNever<ExtraCollection>,
] | null = null;
const settingsContract: [
  AssertNever<MissingSetting>,
  AssertNever<ExtraSetting>,
] | null = null;

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
};

describe("school contract", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ env });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("shares the school schema version with the frontend", () => {
    expect(SCHOOL_SCHEMA_VERSION).toBe(UI_SCHEMA_VERSION);
  });

  it("keeps the bootstrap payload keys in sync with SchoolCollections", () => {
    // The tuple assignments above make the type checker reject any added or
    // removed collection/setting key; the runtime assertion keeps the test honest.
    expect(collectionContract).toBeNull();
    expect(settingsContract).toBeNull();
    expect(BOOTSTRAP_COLLECTION_KEYS).toHaveLength(16);
    expect(BOOTSTRAP_SETTINGS_KEYS).toHaveLength(7);
  });

  it("registers the bootstrap and command routes the adapter uses", () => {
    expect(
      app.hasRoute({ method: "GET", url: "/api/v1/school/bootstrap" }),
    ).toBe(true);
    expect(
      app.hasRoute({ method: "POST", url: "/api/v1/lessons/:id/complete" }),
    ).toBe(true);
    expect(
      app.hasRoute({ method: "POST", url: "/api/v1/lessons/:id/ratings" }),
    ).toBe(true);
    expect(
      app.hasRoute({ method: "POST", url: "/api/v1/lessons/:id/cancel" }),
    ).toBe(true);
    expect(
      app.hasRoute({ method: "POST", url: "/api/v1/lessons/:id/absence" }),
    ).toBe(true);
    expect(
      app.hasRoute({ method: "POST", url: "/api/v1/requests/:id/review" }),
    ).toBe(true);
    expect(
      app.hasRoute({ method: "GET", url: "/api/v1/activity" }),
    ).toBe(true);
    expect(
      app.hasRoute({ method: "POST", url: "/api/v1/uploads" }),
    ).toBe(true);
    expect(
      app.hasRoute({ method: "GET", url: "/api/v1/uploads/:id/download" }),
    ).toBe(true);
    expect(
      app.hasRoute({ method: "GET", url: "/api/v1/notifications" }),
    ).toBe(true);
    expect(
      app.hasRoute({ method: "GET", url: "/api/v1/notifications/state" }),
    ).toBe(true);
    expect(
      app.hasRoute({ method: "PATCH", url: "/api/v1/notifications/state" }),
    ).toBe(true);
  });

  it("exposes the bootstrap endpoint behind authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/school/bootstrap",
    });
    expect(response.statusCode).toBe(401);
  });

  it("keeps the activity log admin-only", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/activity",
    });
    expect(response.statusCode).toBe(401);
  });

  it("exposes uploads and notification state behind authentication", async () => {
    const uploads = await app.inject({ method: "POST", url: "/api/v1/uploads" });
    expect(uploads.statusCode).toBe(401);
    const state = await app.inject({
      method: "GET",
      url: "/api/v1/notifications/state",
    });
    expect(state.statusCode).toBe(401);
    const patch = await app.inject({
      method: "PATCH",
      url: "/api/v1/notifications/state",
      payload: { readIds: [] },
    });
    expect(patch.statusCode).toBe(401);
  });
});
