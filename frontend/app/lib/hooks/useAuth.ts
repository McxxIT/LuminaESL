"use client";

import { useSyncExternalStore } from "react";
import { getSessionSnapshot, subscribeToSession } from "../auth/session";

/** API session state (user + status). Empty in demo mode. */
export function useAuth() {
  return useSyncExternalStore(subscribeToSession, getSessionSnapshot, getSessionSnapshot);
}
