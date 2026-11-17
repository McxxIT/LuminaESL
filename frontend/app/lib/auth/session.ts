"use client";

import { signInWithPassword, signOutOfApi } from "../api/auth";
import { refreshSession, setUnauthorizedHandler } from "../api/client";
import type { ApiUser } from "../api/types";
import type { Account } from "../types";

export type SessionStatus = "idle" | "loading" | "authenticated" | "anonymous";

export type SessionState = {
  status: SessionStatus;
  user: ApiUser | null;
};

let state: SessionState = { status: "idle", user: null };
let restorePromise: Promise<ApiUser | null> | null = null;
const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getSessionSnapshot(): SessionState {
  return state;
}

export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function accountForUser(user: ApiUser): Account {
  return { email: user.email, role: user.role, name: user.name };
}

/** Restore an existing session from the httpOnly refresh cookie. Single-flight. */
export function restoreSession(): Promise<ApiUser | null> {
  if (state.status === "authenticated" && state.user) return Promise.resolve(state.user);
  if (!restorePromise) {
    restorePromise = (async () => {
      setState({ status: "loading", user: null });
      const session = await refreshSession();
      if (session) {
        setState({ status: "authenticated", user: session.user });
        return session.user;
      }
      setState({ status: "anonymous", user: null });
      return null;
    })().finally(() => {
      restorePromise = null;
    });
  }
  return restorePromise;
}

export async function signIn(email: string, password: string): Promise<ApiUser> {
  const session = await signInWithPassword(email, password);
  setState({ status: "authenticated", user: session.user });
  return session.user;
}

export async function signOut(): Promise<void> {
  try {
    await signOutOfApi();
  } finally {
    setState({ status: "anonymous", user: null });
  }
}

setUnauthorizedHandler(() => setState({ status: "anonymous", user: null }));
