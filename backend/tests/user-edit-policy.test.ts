import { describe, expect, it } from "vitest";
import {
  MANAGER_FIELD_MESSAGE,
  STATUS_ADMIN_ONLY_MESSAGE,
  emailChangeSummary,
  planUserPatchEffects,
  userPatchAccess,
  type UserPatchBefore,
} from "../src/lib/user-edit-policy";

function access(
  actorRole: "admin" | "manager" | "teacher" | "student",
  isSelf: boolean,
  body: Record<string, unknown>,
) {
  return userPatchAccess({
    actorRole,
    isSelf,
    bodyKeys: Object.keys(body).filter((key) => body[key] !== undefined),
    bodyStatus: body.status as "active" | "paused" | "archived" | undefined,
  });
}

const ACTIVE: UserPatchBefore = {
  status: "active",
  email: "person@example.test",
  name: "Person One",
  passwordUnusable: false,
};
const INVITED: UserPatchBefore = { ...ACTIVE, status: "invited", passwordUnusable: true };
const PAUSED: UserPatchBefore = { ...ACTIVE, status: "paused" };
const ARCHIVED_NEVER_ACTIVATED: UserPatchBefore = {
  ...ACTIVE,
  status: "archived",
  passwordUnusable: true,
};

describe("userPatchAccess", () => {
  it("should let an admin send any key set, including on their own record", () => {
    expect(access("admin", false, { name: "A", email: "a@b.c", avatarColor: "#000000", status: "archived" })).toEqual({ kind: "admin" });
    expect(access("admin", true, { status: "paused" })).toEqual({ kind: "admin" });
  });

  it("should deny a manager any email or avatarColor key and any archive status", () => {
    for (const body of [
      { email: "x@y.z" },
      { avatarColor: "#111111" },
      { name: "New Name", email: "x@y.z" },
      { name: "New Name", avatarColor: "#111111" },
      { status: "paused", email: "x@y.z" },
    ]) {
      expect(access("manager", false, body)).toEqual({ kind: "deny", message: MANAGER_FIELD_MESSAGE });
    }
    expect(access("manager", false, { status: "archived" })).toEqual({
      kind: "deny",
      message: STATUS_ADMIN_ONLY_MESSAGE,
    });
    expect(access("manager", false, { name: "N", status: "archived" })).toEqual({
      kind: "deny",
      message: STATUS_ADMIN_ONLY_MESSAGE,
    });
  });

  it("should allow a manager only name and active/paused status on a non-self target", () => {
    expect(access("manager", false, { name: "New Name" })).toEqual({ kind: "manager-team" });
    expect(access("manager", false, { status: "paused" })).toEqual({ kind: "manager-team" });
    expect(access("manager", false, { status: "active" })).toEqual({ kind: "manager-team" });
    expect(access("manager", false, { name: "New Name", status: "paused" })).toEqual({ kind: "manager-team" });
  });

  it("should treat a manager body with no allowed keys after parsing as manager-team (route then answers 400)", () => {
    expect(access("manager", false, {})).toEqual({ kind: "manager-team" });
    // Unknown keys are stripped by zod before the policy sees them.
    expect(access("manager", false, { name: undefined })).toEqual({ kind: "manager-team" });
  });

  it("should keep self rules: self may change name, email, avatarColor, never status unless admin", () => {
    for (const role of ["manager", "teacher", "student"] as const) {
      expect(access(role, true, { name: "Me", email: "me@x.y", avatarColor: "#222222" })).toEqual({ kind: "self" });
      expect(access(role, true, { status: "active" })).toEqual({
        kind: "deny",
        message: STATUS_ADMIN_ONLY_MESSAGE,
      });
      expect(access(role, true, { name: "Me", status: "paused" })).toEqual({
        kind: "deny",
        message: STATUS_ADMIN_ONLY_MESSAGE,
      });
    }
  });

  it("should deny teacher and student on a non-self target before any database read", () => {
    for (const role of ["teacher", "student"] as const) {
      expect(access(role, false, { name: "Other" })).toEqual({ kind: "deny" });
      expect(access(role, false, {})).toEqual({ kind: "deny" });
    }
  });
});

describe("planUserPatchEffects", () => {
  const plan = (
    actorRole: "admin" | "manager" | "teacher" | "student",
    isSelf: boolean,
    before: UserPatchBefore,
    body: Parameters<typeof planUserPatchEffects>[0]["body"],
  ) => planUserPatchEffects({ actorRole, isSelf, before, body });

  it("should treat an unchanged email as no change: no revoke, no reinvite", () => {
    for (const before of [ACTIVE, INVITED]) {
      const effects = plan("admin", false, before, { email: before.email });
      expect(effects).toEqual({
        emailChanged: false,
        nameChanged: false,
        statusChanged: false,
        avatarChanged: false,
        revokeSessions: false,
        expireInvites: false,
        reinvite: false,
      });
    }
    // Stored addresses compare case-insensitively against the lowercased body.
    const mixed = plan("admin", false, { ...ACTIVE, email: "Person@Example.test" }, { email: "person@example.test" });
    expect(mixed.emailChanged).toBe(false);
  });

  it("should revoke sessions only when an admin changes another active person's email", () => {
    expect(plan("admin", false, ACTIVE, { email: "new@example.test" })).toMatchObject({
      emailChanged: true,
      revokeSessions: true,
      reinvite: false,
      expireInvites: false,
    });
    expect(plan("admin", true, ACTIVE, { email: "new@example.test" })).toMatchObject({
      emailChanged: true,
      revokeSessions: false,
    });
    for (const role of ["manager", "teacher", "student"] as const) {
      expect(plan(role, true, ACTIVE, { email: "new@example.test" })).toMatchObject({
        emailChanged: true,
        revokeSessions: false,
        reinvite: false,
      });
    }
    expect(plan("admin", false, PAUSED, { email: "new@example.test" })).toMatchObject({
      emailChanged: true,
      revokeSessions: false,
      reinvite: false,
      expireInvites: false,
    });
    expect(plan("admin", false, ARCHIVED_NEVER_ACTIVATED, { email: "new@example.test" })).toMatchObject({
      emailChanged: true,
      revokeSessions: false,
      reinvite: false,
    });
  });

  it("should reinvite only when an admin changes an invited person's email", () => {
    expect(plan("admin", false, INVITED, { email: "new@example.test" })).toMatchObject({
      emailChanged: true,
      reinvite: true,
      expireInvites: true,
      revokeSessions: false,
    });
    // Archive together with the email change: expire only, no reinvite.
    expect(plan("admin", false, INVITED, { email: "new@example.test", status: "archived" })).toMatchObject({
      emailChanged: true,
      reinvite: false,
      expireInvites: true,
      statusChanged: true,
      revokeSessions: false,
    });
    expect(plan("admin", false, INVITED, { name: "Renamed" })).toMatchObject({
      reinvite: false,
      expireInvites: false,
      nameChanged: true,
    });
  });

  it("should revoke on a status change away from active and expire invites on pause or archive", () => {
    expect(plan("manager", false, ACTIVE, { status: "paused" })).toMatchObject({
      statusChanged: true,
      revokeSessions: true,
      expireInvites: true,
    });
    expect(plan("admin", false, ACTIVE, { status: "archived" })).toMatchObject({
      statusChanged: true,
      revokeSessions: true,
      expireInvites: true,
    });
    expect(plan("manager", false, PAUSED, { status: "active" })).toMatchObject({
      statusChanged: true,
      revokeSessions: false,
      expireInvites: false,
    });
    expect(plan("manager", false, PAUSED, { status: "paused" })).toMatchObject({
      statusChanged: false,
      revokeSessions: false,
      expireInvites: true,
    });
  });

  it("should flag only nameChanged for a name-only edit and nothing for an unchanged name", () => {
    expect(plan("manager", false, ACTIVE, { name: "Someone Else" })).toEqual({
      emailChanged: false,
      nameChanged: true,
      statusChanged: false,
      avatarChanged: false,
      revokeSessions: false,
      expireInvites: false,
      reinvite: false,
    });
    expect(plan("manager", false, ACTIVE, { name: ACTIVE.name }).nameChanged).toBe(false);
    expect(plan("admin", false, ACTIVE, { avatarColor: "#123456" }).avatarChanged).toBe(true);
  });
});

describe("emailChangeSummary", () => {
  it("should never put an email address in an activity summary", () => {
    const outcomes = ["signed-out", "invited", "plain"] as const;
    const summaries = outcomes.map((outcome) => emailChangeSummary({ name: "Dana Ray", outcome }));
    expect(summaries).toEqual([
      "Dana Ray (email changed, signed out)",
      "Dana Ray (email changed, new invitation sent)",
      "Dana Ray (email changed)",
    ]);
    for (const summary of summaries) {
      expect(summary).not.toContain("@");
      expect(summary.startsWith("Dana Ray")).toBe(true);
    }
  });
});
