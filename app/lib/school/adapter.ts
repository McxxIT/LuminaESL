import type { SchoolData } from "./types";

/**
 * Where the school store persists. Screens and services never see this; only `store.ts` does.
 * Swap `createLocalStorageAdapter` for an API-backed adapter to move to a real backend.
 */
export interface StorageAdapter {
  load(): SchoolData | null;
  save(data: SchoolData): void;
  /** Called when the data changes outside this tab/process (e.g. another browser tab). */
  subscribe(onExternalChange: () => void): () => void;
}

export function createLocalStorageAdapter(key: string): StorageAdapter {
  const available = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

  return {
    load() {
      if (!available()) return null;
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as SchoolData) : null;
      } catch {
        return null;
      }
    },
    save(data) {
      if (!available()) return;
      try {
        window.localStorage.setItem(key, JSON.stringify(data));
      } catch (error) {
        // Quota exceeded or storage blocked: keep working in memory for this session.
        console.warn("Lumina school store could not be saved.", error);
      }
    },
    subscribe(onExternalChange) {
      if (typeof window === "undefined") return () => {};
      const handler = (event: StorageEvent) => {
        if (event.key === key) onExternalChange();
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
  };
}

/** In-memory adapter for tests and non-browser environments. `notify()` simulates another tab writing. */
export function createMemoryAdapter(initial: SchoolData | null = null) {
  let stored = initial ? JSON.stringify(initial) : null;
  const listeners = new Set<() => void>();

  const adapter: StorageAdapter & { notify(data: SchoolData): void } = {
    load: () => (stored ? (JSON.parse(stored) as SchoolData) : null),
    save: (data) => {
      stored = JSON.stringify(data);
    },
    subscribe(onExternalChange) {
      listeners.add(onExternalChange);
      return () => listeners.delete(onExternalChange);
    },
    notify(data) {
      stored = JSON.stringify(data);
      listeners.forEach((listener) => listener());
    },
  };
  return adapter;
}
