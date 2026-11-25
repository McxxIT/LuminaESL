import { describe, expect, it } from "vitest";
import { envSchema, loadEnv } from "../src/config/env";

const base = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/lumina_test",
  JWT_SECRET: "test-secret-that-is-long-enough-to-pass",
};

const productionMail = {
  ...base,
  NODE_ENV: "production",
  CORS_ORIGIN: "https://app.example",
  MAIL_MAILER: "smtp",
  MAIL_HOST: "smtp.example",
  MAIL_ENCRYPTION: "ssl",
  MAIL_FROM_ADDRESS: "school@example.com",
  APP_URL: "https://app.example",
};

function issuePaths(source: Record<string, string | undefined>): string[] {
  const result = envSchema.safeParse(source);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

describe("mail env keys", () => {
  it("parses with every mail key absent and has no zod defaults", () => {
    const env = envSchema.parse(base);
    expect(env.MAIL_MAILER).toBeUndefined();
    expect(env.MAIL_PORT).toBeUndefined();
    expect(env.MAIL_FROM_NAME).toBeUndefined();
    expect(env.APP_URL).toBeUndefined();
    expect(env.INVITE_RESEND_COOLDOWN_SECONDS).toBeUndefined();
  });

  it("treats empty strings as unset", () => {
    const env = envSchema.parse({
      ...base,
      MAIL_MAILER: "",
      MAIL_HOST: "",
      MAIL_PORT: "",
      MAIL_ENCRYPTION: " ",
      MAIL_FROM_ADDRESS: "",
      APP_URL: "",
      INVITE_RESEND_COOLDOWN_SECONDS: "",
    });
    expect(env.MAIL_MAILER).toBeUndefined();
    expect(env.MAIL_HOST).toBeUndefined();
    expect(env.MAIL_PORT).toBeUndefined();
    expect(env.MAIL_ENCRYPTION).toBeUndefined();
    expect(env.APP_URL).toBeUndefined();
    expect(env.INVITE_RESEND_COOLDOWN_SECONDS).toBeUndefined();
  });

  it("coerces numbers and lowercases the encryption name", () => {
    const env = envSchema.parse({ ...base, MAIL_PORT: "2525", MAIL_ENCRYPTION: "TLS" });
    expect(env.MAIL_PORT).toBe(2525);
    expect(env.MAIL_ENCRYPTION).toBe("tls");
    expect(envSchema.safeParse({ ...base, MAIL_PORT: "0" }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, MAIL_MAILER: "sendmail" }).success).toBe(false);
  });

  it("should parse INVITE_RESEND_COOLDOWN_SECONDS 0 and reject -1", () => {
    expect(envSchema.parse({ ...base, INVITE_RESEND_COOLDOWN_SECONDS: "0" }).INVITE_RESEND_COOLDOWN_SECONDS).toBe(0);
    expect(envSchema.parse({ ...base, INVITE_RESEND_COOLDOWN_SECONDS: "2" }).INVITE_RESEND_COOLDOWN_SECONDS).toBe(2);
    expect(envSchema.safeParse({ ...base, INVITE_RESEND_COOLDOWN_SECONDS: "-1" }).success).toBe(false);
  });
});

describe("production mail guard", () => {
  it("accepts a complete production mail configuration", () => {
    expect(envSchema.safeParse(productionMail).success).toBe(true);
    expect(envSchema.safeParse({ ...productionMail, MAIL_ENCRYPTION: "starttls" }).success).toBe(true);
  });

  it("should refuse to start in production without smtp, host, from address and APP_URL, naming the key", () => {
    for (const key of ["MAIL_MAILER", "MAIL_HOST", "MAIL_FROM_ADDRESS", "APP_URL", "MAIL_ENCRYPTION"] as const) {
      const source: Record<string, string | undefined> = { ...productionMail };
      delete source[key];
      expect(issuePaths(source)).toContain(key);
      expect(() => loadEnv(source as NodeJS.ProcessEnv)).toThrow(new RegExp(key));
    }
  });

  it("never echoes a value in the error message", () => {
    const source = { ...productionMail, MAIL_PASSWORD: "super-secret-value", APP_URL: "ftp://secret-host.example" };
    let message = "";
    try {
      loadEnv(source as NodeJS.ProcessEnv);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("APP_URL");
    expect(message).not.toContain("super-secret-value");
    expect(message).not.toContain("secret-host");
  });

  it("refuses log/array mailers and plaintext transport in production", () => {
    expect(issuePaths({ ...productionMail, MAIL_MAILER: "log" })).toContain("MAIL_MAILER");
    expect(issuePaths({ ...productionMail, MAIL_MAILER: "array" })).toContain("MAIL_MAILER");
    expect(issuePaths({ ...productionMail, MAIL_ENCRYPTION: "none" })).toContain("MAIL_ENCRYPTION");
    expect(issuePaths({ ...productionMail, MAIL_ENCRYPTION: "null" })).toContain("MAIL_ENCRYPTION");
  });

  it("still runs the mail checks when the CORS check fails early", () => {
    const paths = issuePaths({ ...productionMail, CORS_ORIGIN: "*", MAIL_HOST: undefined });
    expect(paths).toContain("CORS_ORIGIN");
    expect(paths).toContain("MAIL_HOST");
  });

  it("does not require mail settings outside production", () => {
    expect(envSchema.safeParse({ ...base, NODE_ENV: "development" }).success).toBe(true);
    expect(envSchema.safeParse({ ...base, NODE_ENV: "test", MAIL_ENCRYPTION: "none" }).success).toBe(true);
  });
});
