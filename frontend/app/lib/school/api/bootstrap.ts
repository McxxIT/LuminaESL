import { request } from "../../api/client";
import { createLocalStorageAdapter } from "../adapter";
import { captureLocalSnapshot } from "../import/capture";
import { API_CACHE_KEY, hydrateSchool } from "../store";
import {
  SCHOOL_SCHEMA_VERSION,
  type SchoolCollections,
  type SchoolData,
  type SchoolSettings,
} from "../types";

/**
 * Read path for API mode. `GET /school/bootstrap` returns the same shapes as the
 * browser store (`SchoolData`), scoped to the signed-in user by the backend.
 *
 * The last good payload is kept in `lumina-school:api-cache` as an offline cache. It is
 * keyed by account email in a sibling key so another user's scoped data is never
 * shown when the API is unreachable. `lumina-school:v1` belongs to local/demo mode
 * and is never written from here.
 */

const CACHE_OWNER_KEY = "lumina-school:cache-owner";
const cache = createLocalStorageAdapter(API_CACHE_KEY);

const COLLECTION_KEYS = [
  "users",
  "teacherProfiles",
  "studentProfiles",
  "courses",
  "courseUnits",
  "lessonPlans",
  "attachments",
  "enrollments",
  "lessons",
  "slotOpenings",
  "requests",
  "absences",
  "ratings",
  "assignments",
  "credits",
  "activity",
  "libraryItems",
  "lessonLibraryItems",
] as const satisfies readonly (keyof SchoolCollections)[];

const SETTING_KEYS = [
  "schoolName",
  "onTheSpotCancellationHours",
  "performanceWindowDays",
  "bookingDayStart",
  "bookingDayEnd",
  "studentLateCancellationHours",
  "refundTeacherCancellations",
] as const satisfies readonly (keyof SchoolSettings)[];

export type SchoolSnapshotSource = "api" | "cache";

export type SchoolSnapshot = {
  data: SchoolData;
  source: SchoolSnapshotSource;
};

export class SchoolBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchoolBootstrapError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Runtime guard for the bootstrap payload and the offline cache. TypeScript already
 * checks the frontend shapes; this catches a backend version mismatch at runtime so
 * a half-shaped payload cannot crash a screen.
 */
export function parseSchoolData(value: unknown): SchoolData {
  if (!isRecord(value)) throw new SchoolBootstrapError("School data is not an object.");
  if (value.version !== SCHOOL_SCHEMA_VERSION) {
    throw new SchoolBootstrapError(
      `School data version ${String(value.version)} does not match the app (${SCHOOL_SCHEMA_VERSION}).`,
    );
  }
  if (typeof value.seededAt !== "string" || value.seededAt.length === 0) {
    throw new SchoolBootstrapError("School data has no seed timestamp.");
  }
  if (!isRecord(value.settings)) {
    throw new SchoolBootstrapError("School data has no settings.");
  }
  for (const key of SETTING_KEYS) {
    if (!(key in value.settings)) {
      throw new SchoolBootstrapError(`School settings are missing \`${key}\`.`);
    }
  }
  const settings = value.settings;
  if (
    typeof settings.schoolName !== "string" ||
    typeof settings.bookingDayStart !== "string" ||
    typeof settings.bookingDayEnd !== "string" ||
    typeof settings.onTheSpotCancellationHours !== "number" ||
    typeof settings.performanceWindowDays !== "number" ||
    typeof settings.studentLateCancellationHours !== "number" ||
    typeof settings.refundTeacherCancellations !== "boolean"
  ) {
    throw new SchoolBootstrapError("School settings have the wrong types.");
  }
  if (!isRecord(value.collections)) {
    throw new SchoolBootstrapError("School data has no collections.");
  }
  for (const key of COLLECTION_KEYS) {
    if (!isRecord(value.collections[key])) {
      throw new SchoolBootstrapError(`School collections are missing \`${key}\`.`);
    }
  }
  return value as SchoolData;
}

function readCacheOwner(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CACHE_OWNER_KEY);
  } catch {
    return null;
  }
}

function writeCacheOwner(email: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_OWNER_KEY, email);
  } catch {
    // Cache metadata is best-effort; the store still has this session's data.
  }
}

function persistCache(email: string, data: SchoolData) {
  cache.save(data);
  writeCacheOwner(email);
}

function readCachedSchool(email: string): SchoolData | null {
  if (readCacheOwner() !== email) return null;
  try {
    return parseSchoolData(cache.load());
  } catch {
    return null;
  }
}

/**
 * Load the signed-in user's school snapshot and hydrate the store. Falls back to
 * the cached payload for the same account when the API cannot be reached.
 */
export async function loadSchoolFromApi(email: string): Promise<SchoolSnapshot> {
  // Defence in depth: the caller captures before this runs, but capturing again here is
  // idempotent and covers any other entry point into the API read path.
  captureLocalSnapshot();
  try {
    const data = parseSchoolData(await request<unknown>("/school/bootstrap"));
    hydrateSchool(data);
    persistCache(email, data);
    return { data, source: "api" };
  } catch (error) {
    const cached = readCachedSchool(email);
    if (cached) {
      hydrateSchool(cached);
      return { data: cached, source: "cache" };
    }
    throw error;
  }
}

/** Re-read the snapshot (window focus, after a write). Throws so callers can keep the last data. */
export async function refreshSchoolFromApi(email: string): Promise<SchoolData> {
  const data = parseSchoolData(await request<unknown>("/school/bootstrap"));
  hydrateSchool(data);
  persistCache(email, data);
  return data;
}
