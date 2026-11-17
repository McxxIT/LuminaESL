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
