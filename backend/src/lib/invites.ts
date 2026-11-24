import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import type { Env } from "../config/env";
import { authTokens, users, type User } from "../db/schema";
import type { DbOrTx } from "./db-handle";
import { AppError, conflict, notFound } from "./errors";
import { renderInviteEmail } from "./invite-email";
import type { Mailer, MailerKind } from "./mailer";
import type { Role } from "./roles";
import { generateToken, hashToken } from "./tokens";

/** Invitation links expire this many hours after they are issued. */
export const INVITE_TTL_HOURS = 72;
/** Resolved default for `INVITE_RESEND_COOLDOWN_SECONDS`. */
export const DEFAULT_INVITE_RESEND_COOLDOWN_SECONDS = 30;
/** Expired invite rows older than this are deleted lazily on the next issue. */
export const INVITE_ROW_RETENTION_DAYS = 7;
/** The only client-visible mail error; SMTP detail never reaches a client. */
export const INVITE_SEND_FAILED_MESSAGE = "The invitation email could not be sent.";
const INVITE_PURPOSE = "invite";
const SCHOOL_NAME = "Lumina ESL";

/** Response shape of an invitation attempt. */
export type InviteOutcome = {
  sent: boolean;
  mode: MailerKind;
  error?: string;
  link?: string;
};

export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_HOURS * 3_600_000);
}

/** `<base>/#set-password=<token>`. A fragment never reaches a server or a log. */
export function inviteLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/#set-password=${token}`;
}

/**
 * Base URL for invitation links, from configuration only (never from request
 * headers): `APP_URL`, else the first `CORS_ORIGIN`, else localhost:3000.
 * Production requires `APP_URL` (env.ts).
 */
export function appBaseUrl(env: Pick<Env, "APP_URL" | "CORS_ORIGIN">): string {
  const configured = env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const firstOrigin = env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .find(Boolean);
  return (firstOrigin ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Whole seconds left in the resend cooldown (0 = a new invite may be issued). */
export function cooldownRemainingSeconds(
  lastCreatedAt: Date | null,
  now: Date,
  cooldownSeconds: number,
): number {
  if (!lastCreatedAt || cooldownSeconds <= 0) return 0;
  const elapsedMs = now.getTime() - lastCreatedAt.getTime();
  const remainingMs = cooldownSeconds * 1000 - elapsedMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

export function resolveInviteCooldown(
  env: Pick<Env, "INVITE_RESEND_COOLDOWN_SECONDS">,
): number {
  return env.INVITE_RESEND_COOLDOWN_SECONDS ?? DEFAULT_INVITE_RESEND_COOLDOWN_SECONDS;
}

/**
 * Link exposure is admin-only in every mode. A manager never receives a link
 * (it would let them set a teammate's password). An admin gets it when the send
 * failed, or outside production when mail is not really sent (log/array).
 */
export function shouldExposeInviteLink(input: {
  nodeEnv: Env["NODE_ENV"];
  mailerKind: MailerKind;
  sent: boolean;
  actorRole: Role;
}): boolean {
  if (input.actorRole !== "admin") return false;
  if (!input.sent) return true;
  return input.mailerKind !== "smtp" && input.nodeEnv !== "production";
}

/** `SELECT ... FOR UPDATE` on the user row; serializes issue/resend per user. */
export async function lockUserForInvite(
  tx: DbOrTx,
  userId: string,
): Promise<User | undefined> {
  const [user] = await tx
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .for("update");
  return user;
}

/** Expire every open (unused, unexpired) invite of a user. */
export async function expireOpenInvites(
  tx: DbOrTx,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const expired = await tx
    .update(authTokens)
    .set({ expiresAt: now })
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.purpose, INVITE_PURPOSE),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .returning({ id: authTokens.id });
  return expired.length;
}

/**
 * Issue a new invite inside the caller's transaction, in this order: lock the
 * user row, require status `invited`, check the cooldown against the newest
 * invite row, expire open invites, insert the new token. Callers that check
 * ownership lock first (`lockUserForInvite`) and then call this; the second
 * lock in the same transaction is a no-op. Returns the raw token (never stored).
 */
export async function issueInvite(
  tx: DbOrTx,
  userId: string,
  options: { now: Date; cooldownSeconds: number },
): Promise<string> {
  const { now, cooldownSeconds } = options;
  const user = await lockUserForInvite(tx, userId);
  if (!user) throw notFound("User not found");
  if (user.status !== "invited") {
    throw conflict("Only accounts waiting for an invitation can be sent one");
  }

  const [latest] = await tx
    .select({ createdAt: authTokens.createdAt })
    .from(authTokens)
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, INVITE_PURPOSE)))
    .orderBy(desc(authTokens.createdAt))
    .limit(1);
  const remaining = cooldownRemainingSeconds(latest?.createdAt ?? null, now, cooldownSeconds);
  if (remaining > 0) {
    throw new AppError(
      429,
      "RATE_LIMITED",
      `An invitation was sent recently, retry in ${remaining} seconds`,
    );
  }

  await expireOpenInvites(tx, userId, now);
  const retentionCutoff = new Date(now.getTime() - INVITE_ROW_RETENTION_DAYS * 86_400_000);
  await tx
    .delete(authTokens)
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.purpose, INVITE_PURPOSE),
        lt(authTokens.expiresAt, retentionCutoff),
      ),
    );

  const token = generateToken();
  await tx.insert(authTokens).values({
    userId,
    tokenHash: hashToken(token),
    purpose: INVITE_PURPOSE,
    expiresAt: inviteExpiry(now),
    createdAt: now,
  });
  return token;
}

/**
 * Consume an invite with one conditional statement. Returns the user id, or
 * null for an unknown, used, expired or wrong-purpose token (indistinguishable).
 */
/**
 * Find the user an invite token belongs to, without locking anything. The
 * caller then locks the user row (`lockUserForInvite`) before consuming, so
 * set-password takes locks in the same order as resend/pause/archive/delete
 * (user row first, then token rows) and cannot deadlock with them.
 */
export async function findInviteUserId(
  tx: DbOrTx,
  rawToken: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ userId: authTokens.userId })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(rawToken)),
        eq(authTokens.purpose, INVITE_PURPOSE),
      ),
    )
    .limit(1);
  return row?.userId ?? null;
}

/**
 * Consume an open invite token for an already-locked user. Returns false when
 * the token is used, expired, unknown, or belongs to another user.
 */
export async function consumeInvite(
  tx: DbOrTx,
  rawToken: string,
  userId: string,
  now: Date,
): Promise<boolean> {
  const rows = await tx
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(rawToken)),
        eq(authTokens.purpose, INVITE_PURPOSE),
        eq(authTokens.userId, userId),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .returning({ id: authTokens.id });
  return rows.length === 1;
}

type InviteLogger = { warn: (obj: object, message?: string) => void };

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length <= 64) return code;
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name.length <= 64) return name;
  }
  return "UNKNOWN";
}

/**
 * Render and send the invitation after the transaction committed. Never
 * throws: a failure becomes `sent:false` with the fixed generic error and one
 * warning that carries only the error code (no token, link, body or address).
 */
export async function deliverInvite(input: {
  mailer: Mailer;
  env: Pick<Env, "NODE_ENV" | "APP_URL" | "CORS_ORIGIN">;
  log: InviteLogger;
  user: { name: string; email: string };
  token: string;
  actorRole: Role;
}): Promise<InviteOutcome> {
  const { mailer, env, log, user, token, actorRole } = input;
  const link = inviteLink(appBaseUrl(env), token);
  const email = renderInviteEmail({
    name: user.name,
    link,
    hours: INVITE_TTL_HOURS,
    schoolName: SCHOOL_NAME,
  });

  let sent = false;
  try {
    await mailer.send({ to: user.email, ...email });
    sent = true;
  } catch (error) {
    log.warn({ mailErrorCode: errorCode(error) }, "invitation email failed");
  }

  const outcome: InviteOutcome = { sent, mode: mailer.kind };
  if (!sent) outcome.error = INVITE_SEND_FAILED_MESSAGE;
  if (
    shouldExposeInviteLink({
      nodeEnv: env.NODE_ENV,
      mailerKind: mailer.kind,
      sent,
      actorRole,
    })
  ) {
    outcome.link = link;
  }
  return outcome;
}
