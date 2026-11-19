import { createSeedSchool } from "../seed";
import type { AttachmentMeta, CollectionName, SchoolData } from "../types";
import { readFileAsync } from "../files";

/**
 * Pure helpers for the one-time import: a stable JSON comparison against the demo
 * seed, and a read of the bytes behind an attachment record.
 */

/** Deterministic JSON: object keys sorted, so equal records always compare equal. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .filter((key) => record[key] !== undefined)
        .map((key) => [key, sortDeep(record[key])]),
    );
  }
  return value;
}

export type SeedDiff = {
  /** Collection -> local ids that are byte-identical to `createSeedSchool()` output. */
  exclude: Partial<Record<CollectionName, string[]>>;
  identical: number;
  total: number;
};

/**
 * Which local records are untouched demo seed rows. Uploading them again would
 * duplicate every demo lesson, rating, and credit entry, so they are excluded
 * from the import by default (`includeSeedRecords` turns this off).
 */
export function diffAgainstSeed(data: SchoolData, seed: SchoolData = createSeedSchool()): SeedDiff {
  const exclude: Partial<Record<CollectionName, string[]>> = {};
  let identical = 0;
  let total = 0;

  for (const key of Object.keys(data.collections) as CollectionName[]) {
    const local = data.collections[key] as Record<string, unknown>;
    const seeded = seed.collections[key] as Record<string, unknown>;
    const ids: string[] = [];
    for (const [id, record] of Object.entries(local)) {
      total += 1;
      const seedRecord = seeded[id];
      if (seedRecord && canonicalJson(record) === canonicalJson(seedRecord)) {
        ids.push(id);
        identical += 1;
      }
    }
    if (ids.length) exclude[key] = ids;
  }

  return { exclude, identical, total };
}

/** Attachments whose bytes are still in this browser and can be uploaded. */
export function attachmentsWithBytes(data: SchoolData): AttachmentMeta[] {
  return Object.values(data.collections.attachments).filter(
    (attachment) => attachment.storageKey && !attachment.storageKey.startsWith("http"),
  );
}

/** Turns a stored data URL into a `File` the existing `/uploads` endpoint accepts. */
export function dataUrlToFile(attachment: AttachmentMeta, dataUrl: string): File | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || attachment.type || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";
  try {
    const bytes = isBase64
      ? Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload));
    return new File([bytes], attachment.name, { type: mime });
  } catch {
    return null;
  }
}

/** Reads the bytes for an attachment record from IndexedDB or localStorage. */
export function readAttachmentData(attachment: AttachmentMeta): Promise<string | undefined> {
  return readFileAsync(attachment.storageKey);
}
