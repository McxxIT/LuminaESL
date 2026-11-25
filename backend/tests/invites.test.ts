import { describe, expect, it, vi } from "vitest";
import {
  INVITE_SEND_FAILED_MESSAGE,
  INVITE_TTL_HOURS,
  appBaseUrl,
  cooldownRemainingSeconds,
  deliverInvite,
  inviteExpiry,
  inviteLink,
  shouldExposeInviteLink,
} from "../src/lib/invites";
import { createArrayMailer, type MailerKind } from "../src/lib/mailer";
import { generateToken, hashToken } from "../src/lib/tokens";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function spyLogger() {
  const lines: string[] = [];
  const record = (...args: unknown[]) => {
    lines.push(JSON.stringify(args));
  };
  return {
    lines,
    logger: {
      info: vi.fn(record),
      warn: vi.fn(record),
      error: vi.fn(record),
      debug: vi.fn(record),
    },
  };
}

describe("invite tokens", () => {
  it("should generate 32-byte base64url invite tokens and hash them to 64 hex chars", () => {
    const tokens = new Set<string>();
    for (let index = 0; index < 50; index += 1) {
      const token = generateToken();
      expect(token).toMatch(TOKEN_PATTERN);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
      tokens.add(token);
      const hash = hashToken(token);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toBe(token);
      expect(hashToken(token)).toBe(hash);
    }
    expect(tokens.size).toBe(50);
  });

  it("expires exactly 72 hours after issue", () => {
    expect(INVITE_TTL_HOURS).toBe(72);
    const now = new Date("2026-11-25T10:00:00.000Z");
    expect(inviteExpiry(now).toISOString()).toBe("2026-11-28T10:00:00.000Z");
  });
});

describe("invite links", () => {
  it("should build the invite link as base/#set-password=token and never use a request header", () => {
    expect(inviteLink("https://school.example", "abc")).toBe(
      "https://school.example/#set-password=abc",
    );
    expect(inviteLink("https://school.example///", "abc")).toBe(
      "https://school.example/#set-password=abc",
    );
    // The base URL comes only from configuration: one argument, the env, never a request.
    expect(appBaseUrl.length).toBe(1);
    expect(
      appBaseUrl({ APP_URL: "https://app.example/", CORS_ORIGIN: "http://a.test" }),
    ).toBe("https://app.example");
    expect(
      appBaseUrl({ APP_URL: undefined, CORS_ORIGIN: " http://a.test , http://b.test" }),
    ).toBe("http://a.test");
    expect(appBaseUrl({ APP_URL: undefined, CORS_ORIGIN: "" })).toBe(
      "http://localhost:3000",
    );
  });
});

describe("resend cooldown", () => {
  const now = new Date("2026-11-25T10:00:30.000Z");

  it("is zero without a previous invite or with a zero cooldown", () => {
    expect(cooldownRemainingSeconds(null, now, 30)).toBe(0);
    expect(cooldownRemainingSeconds(new Date(now), now, 0)).toBe(0);
  });

  it("counts the remaining whole seconds inside the window", () => {
    expect(cooldownRemainingSeconds(new Date("2026-11-25T10:00:30.000Z"), now, 30)).toBe(30);
    expect(cooldownRemainingSeconds(new Date("2026-11-25T10:00:10.500Z"), now, 30)).toBe(11);
    expect(cooldownRemainingSeconds(new Date("2026-11-25T10:00:00.000Z"), now, 30)).toBe(0);
    expect(cooldownRemainingSeconds(new Date("2026-11-25T09:00:00.000Z"), now, 30)).toBe(0);
  });
});

describe("invite link exposure", () => {
  it("should return a link only to an admin (never a manager), and only for non-production log/array or a failed send", () => {
    const kinds: MailerKind[] = ["smtp", "log", "array"];
    for (const nodeEnv of ["production", "development", "test"] as const) {
      for (const mailerKind of kinds) {
        for (const sent of [true, false]) {
          expect(
            shouldExposeInviteLink({ nodeEnv, mailerKind, sent, actorRole: "manager" }),
          ).toBe(false);
          const expected = !sent || (mailerKind !== "smtp" && nodeEnv !== "production");
          expect(
            shouldExposeInviteLink({ nodeEnv, mailerKind, sent, actorRole: "admin" }),
          ).toBe(expected);
        }
      }
    }
    expect(
      shouldExposeInviteLink({
        nodeEnv: "development",
        mailerKind: "smtp",
        sent: true,
        actorRole: "admin",
      }),
    ).toBe(false);
  });
});

describe("deliverInvite", () => {
  const env = {
    NODE_ENV: "development" as const,
    APP_URL: "http://localhost:3000",
    CORS_ORIGIN: "",
  };
  const user = { name: "Ada <Lovelace>", email: "ada@example.com" };

  it("sends one message with the link and returns the admin link in non-production array mode", async () => {
    const mailer = createArrayMailer();
    const { logger, lines } = spyLogger();
    const token = generateToken();
    const outcome = await deliverInvite({ mailer, env, log: logger, user, token, actorRole: "admin" });
    expect(outcome).toEqual({
      sent: true,
      mode: "array",
      link: `http://localhost:3000/#set-password=${token}`,
    });
    expect(mailer.outbox).toHaveLength(1);
    expect(mailer.outbox[0]?.to).toBe(user.email);
    expect(mailer.outbox[0]?.text).toContain(token);
    expect(lines.join("\n")).not.toContain(token);
  });

  it("never returns a link to a manager, on success or failure", async () => {
    const mailer = createArrayMailer();
    const { logger } = spyLogger();
    const ok = await deliverInvite({
      mailer,
      env,
      log: logger,
      user,
      token: generateToken(),
      actorRole: "manager",
    });
    expect(ok).toEqual({ sent: true, mode: "array" });
    mailer.failNext(new Error("SMTP 550 mailbox unavailable"));
    const failed = await deliverInvite({
      mailer,
      env,
      log: logger,
      user,
      token: generateToken(),
      actorRole: "manager",
    });
    expect(failed).toEqual({ sent: false, mode: "array", error: INVITE_SEND_FAILED_MESSAGE });
  });

  it("should not put the token, link, body or recipient in log output on a failed send", async () => {
    const mailer = createArrayMailer();
    const { logger, lines } = spyLogger();
    const token = generateToken();
    mailer.failNext(Object.assign(new Error("SMTP secret detail"), { code: "EAUTH" }));
    const outcome = await deliverInvite({ mailer, env, log: logger, user, token, actorRole: "admin" });
    expect(outcome.sent).toBe(false);
    expect(outcome.error).toBe(INVITE_SEND_FAILED_MESSAGE);
    expect(outcome.link).toContain(token);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const output = lines.join("\n");
    expect(output).not.toContain(token);
    expect(output).not.toContain("set-password");
    expect(output).not.toContain(user.email);
    expect(output).not.toContain("SMTP secret detail");
    expect(output).toContain("EAUTH");
  });
});
