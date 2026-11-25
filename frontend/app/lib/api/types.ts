import type { Role } from "../types";

/** The subset of the backend user record the UI needs to sign someone in. */
export type ApiUser = {
  id: string;
  role: Role;
  name: string;
  email: string;
  status: "active" | "paused" | "archived" | "invited";
  avatarColor?: string;
  createdAt?: string;
};

/**
 * Outcome of an invitation email (create or resend). `link` is only ever present
 * for an admin: outside production when mail is logged, or when the send failed.
 */
export type InviteOutcome = {
  sent: boolean;
  mode: "smtp" | "log" | "array";
  error?: string;
  link?: string;
};

export type AuthResponse = {
  accessToken: string;
  user: ApiUser;
};

export type MeResponse = {
  user: ApiUser;
  profile: unknown;
};

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};
