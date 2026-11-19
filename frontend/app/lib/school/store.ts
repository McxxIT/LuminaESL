import { createLocalStorageAdapter, type StorageAdapter } from "./adapter";
import { isApiDataMode } from "../auth/mode";
import { migrateLegacyWorkspaces } from "./migrate";
import { createSeedSchool, defaultSchoolSettings } from "./seed";
import { SCHOOL_SCHEMA_VERSION, type SchoolData } from "./types";

/** The local/demo school. API mode never writes this key (see `API_CACHE_KEY`). */
export const SCHOOL_STORAGE_KEY = "lumina-school:v1";
/**
 * API mode's offline cache. It is deliberately a different key from `SCHOOL_STORAGE_KEY`:
 * hydrating `/school/bootstrap` into `lumina-school:v1` used to overwrite the user's local
 * school on the first API sign-in, which destroyed the data the one-time import needs.
 */
export const API_CACHE_KEY = "lumina-school:api-cache";
export { SCHOOL_SCHEMA_VERSION };

/** `local` keeps the browser store; `api` hydrates it from `GET /school/bootstrap`. */
export type SchoolDataSource = "local" | "api";

export function createEmptySchool(): SchoolData {
  return {
    version: SCHOOL_SCHEMA_VERSION,
    seededAt: "",
    settings: defaultSchoolSettings(),
    collections: {
      users: {},
      teacherProfiles: {},
      studentProfiles: {},
      courses: {},
      courseUnits: {},
      lessonPlans: {},
      attachments: {},
      enrollments: {},
      lessons: {},
      slotOpenings: {},
      requests: {},
      absences: {},
      ratings: {},
      assignments: {},
      credits: {},
      activity: {},
    },
  };
}

/** Returned during server rendering and before hydration. Stable reference for useSyncExternalStore. */
const SERVER_SNAPSHOT: SchoolData = createEmptySchool();

let adapter: StorageAdapter = createLocalStorageAdapter(SCHOOL_STORAGE_KEY);
/** API mode's cache adapter. Only used while `dataSource === "api"`. */
const apiCacheAdapter: StorageAdapter = createLocalStorageAdapter(API_CACHE_KEY);
/** True until `configureSchoolStore` swaps in another adapter; the default one needs a browser. */
let adapterIsBrowserDefault = true;
let dataSource: SchoolDataSource = isApiDataMode() ? "api" : "local";
let snapshot: SchoolData | null = null;
let detachAdapter: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Returns usable data for the current schema, or null when it must be re-seeded. */
function upgrade(data: SchoolData | null): SchoolData | null {
  if (!data || typeof data !== "object" || !data.collections || !data.seededAt) return null;
  if (data.version === SCHOOL_SCHEMA_VERSION) {
    // Fill collections/settings added after this data was saved.
    const empty = createEmptySchool();
    const collections = { ...empty.collections, ...data.collections };
    // Collections added after this data was saved start from the demo seed (e.g. shared homework).
    if (!data.collections.assignments) collections.assignments = createSeedSchool().collections.assignments;
    return { ...data, settings: { ...empty.settings, ...data.settings }, collections };
  }
  return null;
}

function ensureLoaded(): SchoolData {
  if (snapshot) return snapshot;
  // API mode starts empty; `bootstrap.ts` fills it from the server (or its cache).
  // Never fall back to the demo seed, so no screen shows another school's records.
  if (dataSource === "api") {
    snapshot = createEmptySchool();
    return snapshot;
  }
  const stored = upgrade(adapter.load());
  snapshot = stored ?? createSeedSchool();
  let changed = !stored;
  // First load in a browser: bring in data from the old per-user workspaces once.
  if (adapterIsBrowserDefault && typeof window !== "undefined" && !snapshot.migratedAt) {
    const draft = structuredClone(snapshot);
    try {
      migrateLegacyWorkspaces(draft, window.localStorage);
      snapshot = draft;
    } catch (error) {
      console.warn("Lumina: legacy workspace migration skipped.", error);
      snapshot = { ...snapshot, migratedAt: new Date().toISOString() };
    }
    changed = true;
  }
  if (changed) adapter.save(snapshot);
  detachAdapter = adapter.subscribe(() => {
    const next = upgrade(adapter.load());
    if (!next) return;
    snapshot = next;
    emit();
  });
  return snapshot;
}

/** Current data. Immutable: every update produces a new object, so React can compare by reference. */
export function getSchoolSnapshot(): SchoolData {
  if (typeof window === "undefined" && adapterIsBrowserDefault) return SERVER_SNAPSHOT;
  return ensureLoaded();
}

export function getServerSchoolSnapshot(): SchoolData {
  return SERVER_SNAPSHOT;
}

export function subscribeSchool(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The only way to change school data. Services call this with a mutator that edits a private
 * draft; the draft then becomes the new snapshot, is persisted, and subscribers are notified.
 */
export function updateSchool<T>(mutator: (draft: SchoolData) => T): T {
  const draft = structuredClone(ensureLoaded());
  const result = mutator(draft);
  snapshot = draft;
  // In API mode the server is the source of truth; writes land in B2. Do not
  // overwrite the offline cache with browser-only edits.
  if (dataSource === "local") adapter.save(draft);
  emit();
  return result;
}

/**
 * Replace the snapshot with data fetched from the API (or its offline cache).
 * Unlike `updateSchool` this is always persisted, so the last good payload can
 * be used the next time the API is unreachable.
 *
 * API mode persists to `lumina-school:api-cache`, never to the local store key:
 * overwriting `lumina-school:v1` here is what used to destroy local-only data
 * before it could be imported.
 */
export function hydrateSchool(data: SchoolData): SchoolData {
  snapshot = data;
  if (dataSource === "api" && adapterIsBrowserDefault) apiCacheAdapter.save(data);
  else adapter.save(data);
  emit();
  return data;
}

/** Drop the in-memory snapshot (sign out) without touching the offline cache. */
export function clearSchoolSnapshot() {
  snapshot = createEmptySchool();
  emit();
}

/** Wipe and re-seed the demo school (used by "Reset demo" actions and tests). */
export function resetSchool(seed: SchoolData = createSeedSchool()) {
  ensureLoaded();
  snapshot = seed;
  if (dataSource === "local") adapter.save(seed);
  emit();
  return seed;
}

/** Swap the persistence layer (tests, or a future API adapter). Drops the cached snapshot. */
export function configureSchoolStore(next: StorageAdapter) {
  detachAdapter?.();
  detachAdapter = null;
  adapter = next;
  adapterIsBrowserDefault = false;
  snapshot = null;
}

/** Switch read source (tests, or an env-driven setup). Drops the cached snapshot. */
export function configureSchoolDataSource(next: SchoolDataSource) {
  if (next === dataSource) return;
  detachAdapter?.();
  detachAdapter = null;
  dataSource = next;
  snapshot = null;
}
