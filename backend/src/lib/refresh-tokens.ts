import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { Env } from "../config/env.js";
import { refreshTokens } from "../db/schema.js";
import type { DbOrTx } from "./db-handle.js";

/** Name of the httpOnly cookie that carries the opaque refresh token. */
export const REFRESH_COOKIE = "refresh_token";
/** The refresh cookie is only sent to the auth routes. */
export const REFRESH_COOKIE_PATH = "/api/v1/auth";
/** Revoked rows are kept this long (for audit/debugging) before pruning. */
export const REVOKED_TOKEN_RETENTION_DAYS = 7;

export type RefreshCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
};

/**
 * Cookie attributes for the refresh token. Pure so it can be tested without a
 * database: `secure` is only set in production (local dev runs over http).
 */
export function refreshCookieOptions(
  env: Pick<Env, "NODE_ENV" | "REFRESH_TOKEN_TTL_DAYS">,
): RefreshCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400,
  };
}

/**
 * Revoke every still-active refresh token of a user. Used after a password
 * change or admin reset, and when an account is paused or archived. Returns the
 * number of tokens revoked.
 */
export async function revokeUserRefreshTokens(
  db: DbOrTx,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const revoked = await db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  return revoked.length;
}

/**
 * Delete expired refresh tokens and tokens revoked more than
 * `REVOKED_TOKEN_RETENTION_DAYS` ago. With `userId` the delete uses the
 * `refresh_tokens_user_idx` index; without it the whole table is scanned, so the
 * global sweep must stay throttled. Returns the number of rows deleted.
 */
export async function pruneRefreshTokens(
  db: DbOrTx,
  options: { userId?: string; now?: Date } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const revokedBefore = new Date(
    now.getTime() - REVOKED_TOKEN_RETENTION_DAYS * 86_400_000,
  );
  const stale = or(
    lt(refreshTokens.expiresAt, now),
    and(isNotNull(refreshTokens.revokedAt), lt(refreshTokens.revokedAt, revokedBefore)),
  );
  const where = options.userId
    ? and(eq(refreshTokens.userId, options.userId), stale)
    : stale;
  const deleted = await db
    .delete(refreshTokens)
    .where(where)
    .returning({ id: refreshTokens.id });
  return deleted.length;
}
