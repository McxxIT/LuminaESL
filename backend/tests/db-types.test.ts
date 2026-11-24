import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { pgTypes } from "../src/plugins/db";
import { envSchema } from "../src/config/env";

describe("numeric type parser", () => {
  it("targets the numeric OID 1700", () => {
    expect(pgTypes.numeric.to).toBe(1700);
    expect(pgTypes.numeric.from).toContain(1700);
  });

  it("should register the numeric parser for OID 1700 via the from option", async () => {
    const client = postgres("postgres://x@127.0.0.1:1/x", { types: pgTypes });
    const parser = client.options.parsers[1700];
    expect(typeof parser).toBe("function");
    expect(parser?.("12.00")).toBe(12);
    expect(parser?.("-0.50")).toBe(-0.5);
    await client.end({ timeout: 0 });
  });

  it("should parse numeric 12.00 as number 12", () => {
    expect(pgTypes.numeric.parse("12.00")).toBe(12);
    expect(pgTypes.numeric.serialize(1.5)).toBe("1.5");
  });
});

describe("env defaults", () => {
  it("should default RATE_LIMIT_MAX to 300", () => {
    const env = envSchema.parse({
      DATABASE_URL: "postgres://x@localhost/x",
      JWT_SECRET: "test-secret-that-is-long-enough-to-pass",
    });
    expect(env.RATE_LIMIT_MAX).toBe(300);
  });

  const base = {
    DATABASE_URL: "postgres://x@localhost/x",
    JWT_SECRET: "test-secret-that-is-long-enough-to-pass",
  };

  it("should default AUTH_RATE_LIMIT_MAX to 30 and reject wildcard CORS_ORIGIN in production", () => {
    expect(envSchema.parse(base).AUTH_RATE_LIMIT_MAX).toBe(30);
    expect(envSchema.parse({ ...base, AUTH_RATE_LIMIT_MAX: "100000" }).AUTH_RATE_LIMIT_MAX).toBe(100000);

    for (const CORS_ORIGIN of ["*", "", " , ", "http://a.example,*", "ftp://files.example"]) {
      const result = envSchema.safeParse({ ...base, NODE_ENV: "production", CORS_ORIGIN });
      expect(result.success, `CORS_ORIGIN=${JSON.stringify(CORS_ORIGIN)}`).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes("CORS_ORIGIN"))).toBe(true);
      }
    }
  });

  it("should accept explicit CORS origins in production and wildcard outside production", () => {
    expect(
      envSchema.safeParse({
        ...base,
        NODE_ENV: "production",
        CORS_ORIGIN: "https://app.lumina.school, https://admin.lumina.school",
      }).success,
    ).toBe(true);
    expect(envSchema.safeParse({ ...base, NODE_ENV: "development", CORS_ORIGIN: "*" }).success).toBe(true);
  });
});
