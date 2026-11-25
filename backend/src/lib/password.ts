import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Minimum password length for every route that sets a password (no composition rules). */
export const PASSWORD_MIN_LENGTH = 10;
/** Maximum password length; bounds scrypt work per request. */
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Shared password policy for register, create-user, change-password, and admin
 * reset. Length only: composition rules add churn without much benefit at this
 * scale, and the smoke script uses base64url passwords without symbols.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

/** Body for `POST /auth/change-password`; the new password must differ from the current one. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .refine((body) => body.newPassword !== body.currentPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });

/** Body for `POST /users/:id/reset-password` (admin): only the new password is accepted. */
export const resetPasswordSchema = z.object({ newPassword: passwordSchema }).strict();

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

function derive(
  password: string,
  salt: string,
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH).toString("base64");
  const hash = await derive(password, salt, KEY_LENGTH);
  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt,
    hash.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const salt = parts[4];
  const expected = parts[5];
  if (!salt || !expected) return false;

  const expectedBuffer = Buffer.from(expected, "base64");
  const actual = await derive(password, salt, expectedBuffer.length);
  if (actual.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actual, expectedBuffer);
}

/**
 * Prefix of a password hash that can never verify. `verifyPassword` only accepts
 * six `$`-separated parts starting with `scrypt`, so this value always fails, and
 * the fixed prefix marks an account that has never set a password (invited).
 */
export const UNUSABLE_PASSWORD_PREFIX = "!unset$";

/** A fresh, never-verifiable password hash for an invited account. */
export function unusablePasswordHash(): string {
  return `${UNUSABLE_PASSWORD_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** True when the account has never set a password (see `unusablePasswordHash`). */
export function isUnusablePasswordHash(hash: string): boolean {
  return hash.startsWith(UNUSABLE_PASSWORD_PREFIX);
}
