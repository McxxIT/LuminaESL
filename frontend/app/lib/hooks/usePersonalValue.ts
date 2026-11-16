"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A small per-browser value (preferences, read markers) that every component using the same key
 * sees at once: the shell's notification bell and the Settings page stay in sync.
 */

const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return fallback;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = fallback;
  if (raw) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

function emit(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

export function usePersonalValue<T>(key: string, fallback: T): [T, (next: T | ((current: T) => T)) => void] {
  const subscribe = useCallback((listener: () => void) => {
    const set = listeners.get(key) ?? new Set();
    set.add(listener);
    listeners.set(key, set);
    const onStorage = (event: StorageEvent) => { if (event.key === key) listener(); };
    window.addEventListener("storage", onStorage);
    return () => {
      set.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);
  const value = useSyncExternalStore(subscribe, () => read(key, fallback), () => fallback);
  const setValue = useCallback((next: T | ((current: T) => T)) => {
    const current = read(key, fallback);
    const resolved = typeof next === "function" ? (next as (value: T) => T)(current) : next;
    try {
      window.localStorage.setItem(key, JSON.stringify(resolved));
    } catch {
      // Storage blocked: keep the value for this session only.
      cache.set(key, { raw: JSON.stringify(resolved), value: resolved });
    }
    emit(key);
  }, [key, fallback]);
  return [value, setValue];
}
