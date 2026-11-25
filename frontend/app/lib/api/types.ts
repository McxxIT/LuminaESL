import type { Role } from "../types";

/** The subset of the backend user record the UI needs to sign someone in. */
export type ApiUser = {
  id: string;
  role: Role;
  name: string;
  email: string;
  status: "active" | "paused" | "archived";
  avatarColor?: string;
  createdAt?: string;
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
