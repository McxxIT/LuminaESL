/**
 * Pure rules for `PATCH /users/:id` (no database access). The route calls
 * `userPatchAccess` before any read, then `planUserPatchEffects` on the row it
 * locked inside its transaction.
 */
import type { Role } from "./roles.js";

export type PatchStatus = "active" | "paused" | "archived";

export const MANAGER_FIELD_MESSAGE =
  "Managers can only change a team member's name, or pause and reactivate them";
export const STATUS_ADMIN_ONLY_MESSAGE = "Only admins can change this account status";

export type UserPatchAccess =
  | { kind: "deny"; message?: string }
  | { kind: "admin" }
  | { kind: "self" }
  | { kind: "manager-team" };

const MANAGER_KEYS = new Set(["name", "status"]);

/**
 * Static access decision. `bodyKeys` are the defined keys of the parsed (zod
 * stripped) body, so an empty key set passes and the route's empty-body check
 * answers instead.
 */
export function userPatchAccess(input: {
  actorRole: Role;
  isSelf: boolean;
  bodyKeys: readonly string[];
  bodyStatus: PatchStatus | undefined;
}): UserPatchAccess {
  if (input.actorRole === "admin") return { kind: "admin" };
  if (input.isSelf) {
    if (input.bodyStatus !== undefined) {
      return { kind: "deny", message: STATUS_ADMIN_ONLY_MESSAGE };
    }
    return { kind: "self" };
  }
  if (input.actorRole === "manager") {
    if (input.bodyKeys.some((key) => !MANAGER_KEYS.has(key))) {
      return { kind: "deny", message: MANAGER_FIELD_MESSAGE };
    }
    if (input.bodyStatus === "archived") {
      return { kind: "deny", message: STATUS_ADMIN_ONLY_MESSAGE };
    }
    return { kind: "manager-team" };
  }
  return { kind: "deny" };
}

export type UserPatchBefore = {
  status: "active" | "paused" | "archived" | "invited" | "inactive";
  email: string;
  name: string;
  passwordUnusable: boolean;
};

export type UserPatchBody = {
  name?: string;
  email?: string;
  avatarColor?: string;
  status?: PatchStatus;
};

export type UserPatchEffects = {
  emailChanged: boolean;
  nameChanged: boolean;
  statusChanged: boolean;
  avatarChanged: boolean;
  revokeSessions: boolean;
  expireInvites: boolean;
  reinvite: boolean;
};

/** Side effects of an edit, decided from the locked pre-update row. */
export function planUserPatchEffects(input: {
  actorRole: Role;
  isSelf: boolean;
  before: UserPatchBefore;
  body: UserPatchBody;
}): UserPatchEffects {
  const { before, body } = input;
  const emailChanged =
    body.email !== undefined && body.email !== before.email.toLowerCase();
  const nameChanged = body.name !== undefined && body.name !== before.name;
  const statusChanged = body.status !== undefined && body.status !== before.status;
  const avatarChanged = body.avatarColor !== undefined;
  const adminOnOther = input.actorRole === "admin" && !input.isSelf;

  const revokeSessions =
    (adminOnOther && emailChanged && before.status === "active") ||
    (statusChanged && before.status === "active");
  const invitedEmailChange = emailChanged && before.status === "invited";
  const reinvite = adminOnOther && invitedEmailChange && body.status === undefined;
  const expireInvites =
    invitedEmailChange || body.status === "paused" || body.status === "archived";

  return {
    emailChanged,
    nameChanged,
    statusChanged,
    avatarChanged,
    revokeSessions,
    expireInvites,
    reinvite,
  };
}

/** Activity summary for an email change; never contains an address. */
export function emailChangeSummary(input: {
  name: string;
  outcome: "signed-out" | "invited" | "plain";
}): string {
  if (input.outcome === "signed-out") return `${input.name} (email changed, signed out)`;
  if (input.outcome === "invited") return `${input.name} (email changed, new invitation sent)`;
  return `${input.name} (email changed)`;
}
