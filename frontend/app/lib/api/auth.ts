import { request, setAccessToken } from "./client";
import type { AuthResponse, MeResponse } from "./types";

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const session = await request<AuthResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  setAccessToken(session.accessToken);
  return session;
}

/**
 * Accept an invitation: set the first password with the single-use token from
 * the link. Public (no session); answers 204 and does not sign the person in.
 */
export async function setPasswordWithToken(token: string, password: string): Promise<void> {
  await request<void>("/auth/set-password", {
    method: "POST",
    body: { token, password },
    auth: false,
  });
}

export async function signOutOfApi(): Promise<void> {
  try {
    await request<{ success: boolean }>("/auth/logout", { method: "POST" });
  } finally {
    setAccessToken(null);
  }
}

export async function fetchMe(): Promise<MeResponse> {
  return request<MeResponse>("/auth/me");
}

/**
 * Change the signed-in user's password. A wrong current password is a 400
 * `INVALID_CURRENT_PASSWORD` (never 401, so the client does not try a refresh).
 * The server rotates this device's refresh cookie and ends every other session.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await request<{ success: boolean }>("/auth/change-password", {
    method: "POST",
    body: { currentPassword, newPassword },
  });
}
