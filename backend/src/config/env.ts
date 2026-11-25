import { z } from "zod";

function isHttpOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Empty strings from an env file count as unset. */
export function emptyToUndefined(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.trim() === "" ? undefined : value;
}

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

/** Mail transport encryption names accepted in `MAIL_ENCRYPTION`. */
export const MAIL_ENCRYPTIONS = ["ssl", "smtps", "tls", "starttls", "none", "null"] as const;
export type MailEncryption = (typeof MAIL_ENCRYPTIONS)[number];
const ENCRYPTED_MAIL_TRANSPORTS: readonly MailEncryption[] = ["ssl", "smtps", "tls", "starttls"];

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    ACCESS_TOKEN_TTL: z.string().default("15m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    CORS_ORIGIN: z.string().default("http://localhost:3000"),
    UPLOAD_DIR: z.string().default("uploads"),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    /** Per-account limit on login, refresh, and change-password (requests per minute). */
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
    // Mail and invitations. All optional with no zod defaults; defaults are
    // resolved in code (lib/mailer.ts, lib/invites.ts).
    MAIL_MAILER: z.preprocess(
      emptyToUndefined,
      z.enum(["smtp", "log", "array"]).optional(),
    ),
    MAIL_HOST: optionalString,
    MAIL_PORT: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().positive().optional(),
    ),
    MAIL_USERNAME: optionalString,
    MAIL_PASSWORD: optionalString,
    MAIL_ENCRYPTION: z.preprocess(
      (value) => {
        const cleaned = emptyToUndefined(value);
        return typeof cleaned === "string" ? cleaned.trim().toLowerCase() : cleaned;
      },
      z.enum(MAIL_ENCRYPTIONS).optional(),
    ),
    MAIL_FROM_ADDRESS: optionalString,
    MAIL_FROM_NAME: optionalString,
    APP_URL: optionalString,
    /** Minimum seconds between two invitations for one user (resolved default 30). */
    INVITE_RESEND_COOLDOWN_SECONDS: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().nonnegative().optional(),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    checkProductionCors(env, ctx);
    checkProductionMail(env, ctx);
  });

type ParsedEnv = z.infer<typeof envSchema>;

function checkProductionCors(env: ParsedEnv, ctx: z.RefinementCtx): void {
  const origins = env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CORS_ORIGIN"],
      message: "CORS_ORIGIN must list explicit origins in production",
    });
    return;
  }
  for (const origin of origins) {
    if (origin === "*" || !isHttpOrigin(origin)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message:
          "CORS_ORIGIN must not contain '*' or non-http(s) origins in production",
      });
      return;
    }
  }
}

/**
 * Production mail guard. A separate block from the CORS checks so an early
 * CORS return can never skip it. Messages name the key, never the value.
 */
function checkProductionMail(env: ParsedEnv, ctx: z.RefinementCtx): void {
  const fail = (key: keyof ParsedEnv, message: string) => {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });
  };
  if (env.MAIL_MAILER !== "smtp") {
    fail("MAIL_MAILER", "MAIL_MAILER must be smtp in production");
  }
  if (!env.MAIL_HOST) fail("MAIL_HOST", "MAIL_HOST is required in production");
  if (!env.MAIL_FROM_ADDRESS) {
    fail("MAIL_FROM_ADDRESS", "MAIL_FROM_ADDRESS is required in production");
  }
  if (!env.APP_URL) {
    fail("APP_URL", "APP_URL is required in production");
  } else if (!isHttpOrigin(env.APP_URL)) {
    fail("APP_URL", "APP_URL must be an http(s) URL in production");
  }
  if (!env.MAIL_ENCRYPTION || !ENCRYPTED_MAIL_TRANSPORTS.includes(env.MAIL_ENCRYPTION)) {
    fail(
      "MAIL_ENCRYPTION",
      "MAIL_ENCRYPTION must be ssl, smtps, tls or starttls in production",
    );
  }
}

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
