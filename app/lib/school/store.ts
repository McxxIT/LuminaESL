import { createLocalStorageAdapter, type StorageAdapter } from "./adapter";
import { migrateLegacyWorkspaces } from "./migrate";
import { createSeedSchool, defaultSchoolSettings } from "./seed";
import { SCHOOL_SCHEMA_VERSION, type SchoolData } from "./types";

export const SCHOOL_STORAGE_KEY = "lumina-school:v1";
export { SCHOOL_SCHEMA_VERSION };

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
      credits: {},
      activity: {},
    },
  };
}

/** Returned during server rendering and before hydration. Stable reference for useSyncExternalStore. */
const SERVER_SNAPSHOT: SchoolData = createEmptySchool();

let adapter: StorageAdapter = createLocalStorageAdapter(SCHOOL_STORAGE_KEY);
/** True until `configureSchoolStore` swaps in another adapter; the default one needs a browser. */
let adapterIsBrowserDefault = true;
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
    return { ...data, settings: { ...empty.settings, ...data.settings }, collections: { ...empty.collections, ...data.collections } };
  }
  return null;
}

function ensureLoaded(): SchoolData {
  if (snapshot) return snapshot;
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
  adapter.save(draft);
  emit();
  return result;
}

/** Wipe and re-seed the demo school (used by "Reset demo" actions and tests). */
export function resetSchool(seed: SchoolData = createSeedSchool()) {
  ensureLoaded();
  snapshot = seed;
  adapter.save(seed);
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
