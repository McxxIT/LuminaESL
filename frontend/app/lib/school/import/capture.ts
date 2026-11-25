import { SCHOOL_STORAGE_KEY } from "../store";
import { SCHOOL_SCHEMA_VERSION, type SchoolData } from "../types";

/**
 * Capture of the local school before API mode can touch it, plus the keys the
 * one-time import (D2) reads. Nothing here talks to the backend; the import UI
 * and `/school/import` do that.
 *
 * Keys:
 * - `lumina-school:v1`               local/demo school (never written in API mode)
 * - `lumina-school:api-cache`        API offline cache (see `store.ts`)
 * - `lumina-school:pending-import`   captured snapshot waiting to be imported
 * - `lumina-school:imported:<seededAt>` read-only archive kept after a successful import
 */

export const PENDING_IMPORT_KEY = "lumina-school:pending-import";
export const IMPORT_ARCHIVE_PREFIX = "lumina-school:imported:";

export type PendingImport = {
  capturedAt: string;
  sourceSeededAt: string;
  recordCount: number;
  data: SchoolData;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Every local id is a slug (`student-mia`, `lesson-grace-3`, `course-<base36>`), never a UUID. */
export function looksLikeLocalSnapshot(raw: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!isRecord(parsed)) return false;
  if (parsed.version !== SCHOOL_SCHEMA_VERSION) return false;
  if (typeof parsed.seededAt !== "string" || parsed.seededAt.length === 0) return false;
  if (!isRecord(parsed.collections)) return false;

  let records = 0;
  let localIds = 0;
  for (const collection of Object.values(parsed.collections)) {
    if (!isRecord(collection)) continue;
    for (const record of Object.values(collection)) {
      if (!isRecord(record) || typeof record.id !== "string") continue;
      records += 1;
      if (!isUuid(record.id)) localIds += 1;
    }
  }
  return records > 0 && localIds > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function archiveKey(seededAt: string): string {
  return `${IMPORT_ARCHIVE_PREFIX}${seededAt}`;
}

export function hasImportedArchive(seededAt?: string): boolean {
  const store = storage();
  if (!store) return false;
  try {
    if (seededAt) return store.getItem(archiveKey(seededAt)) !== null;
    for (let index = 0; index < store.length; index += 1) {
      if (store.key(index)?.startsWith(IMPORT_ARCHIVE_PREFIX)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function readPendingImport(): PendingImport | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PENDING_IMPORT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingImport;
    if (!parsed || typeof parsed.capturedAt !== "string") return null;
    if (!isRecord(parsed.data) || !isRecord(parsed.data.collections)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePending(data: SchoolData, capturedAt = new Date().toISOString()): PendingImport | null {
  const store = storage();
  if (!store) return null;
  const recordCount = Object.values(data.collections).reduce(
    (total, collection) => total + Object.keys(collection).length,
    0,
  );
  const pending: PendingImport = {
    capturedAt,
    sourceSeededAt: data.seededAt,
    recordCount,
    data,
  };
  try {
    store.setItem(PENDING_IMPORT_KEY, JSON.stringify(pending));
    return pending;
  } catch (error) {
    console.warn("Lumina: could not capture the local school for import.", error);
    return null;
  }
}

/**
 * Copy the local school into the import key. Safe to call on every API boot:
 * it never overwrites an existing pending capture unless `force` is set, and it
 * keeps the archive from a previous import authoritative for the same `seededAt`.
 *
 * Returns the pending capture (existing or new), or null when there is nothing
 * worth importing on this browser.
 */
export function captureLocalSnapshot(options: { force?: boolean } = {}): PendingImport | null {
  const store = storage();
  if (!store) return null;
  try {
    const existing = readPendingImport();
    if (existing && !options.force) return existing;

    const raw = store.getItem(SCHOOL_STORAGE_KEY);
    if (!raw || !looksLikeLocalSnapshot(raw)) return existing;

    const data = JSON.parse(raw) as SchoolData;
    if (!options.force && hasImportedArchive(data.seededAt)) return existing;
    return writePending(data);
  } catch (error) {
    console.warn("Lumina: local-school capture skipped.", error);
    return null;
  }
}

/** Keep a read-only copy of the imported snapshot; the pending key is cleared separately. */
export function archivePendingImport(): string | null {
  const store = storage();
  const pending = readPendingImport();
  if (!store || !pending) return null;
  const key = archiveKey(pending.sourceSeededAt);
  try {
    store.setItem(key, JSON.stringify(pending));
    return key;
  } catch {
    return null;
  }
}

export function clearPendingImport() {
  storage()?.removeItem(PENDING_IMPORT_KEY);
}

/** True when this browser still holds a local school that has not been imported yet. */
export function hasPendingImport(): boolean {
  return readPendingImport() !== null;
}
