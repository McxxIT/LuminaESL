/**
 * Attachment bytes, kept outside the JSON school store so it stays small. Records reference a
 * file by `AttachmentMeta.storageKey`:
 * - `lumina-school-file:<id>`: small files (cancellation evidence) in browser storage, read synchronously.
 * - `idb:<id>`: lesson-plan uploads in IndexedDB (no 5 MB storage ceiling), read asynchronously.
 */

const FILE_PREFIX = "lumina-school-file:";
const memoryFiles = new Map<string, string>();

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function fileStorageKey(attachmentId: string) {
  return `${FILE_PREFIX}${attachmentId}`;
}

/** Stores a data URL. Returns false when the browser refuses (e.g. quota exceeded). */
export function saveFile(storageKey: string, dataUrl: string): boolean {
  const store = storage();
  if (!store) {
    memoryFiles.set(storageKey, dataUrl);
    return true;
  }
  try {
    store.setItem(storageKey, dataUrl);
    return true;
  } catch {
    return false;
  }
}

export function readFile(storageKey: string | undefined): string | undefined {
  if (!storageKey) return undefined;
  const store = storage();
  return (store ? store.getItem(storageKey) : memoryFiles.get(storageKey)) ?? undefined;
}

export function deleteFile(storageKey: string) {
  storage()?.removeItem(storageKey);
  memoryFiles.delete(storageKey);
}

// Large files (IndexedDB) -------------------------------------------------------------------

const IDB_PREFIX = "idb:";
const DB_NAME = "lumina-files";
const STORE = "files";
/** Largest lesson-plan upload accepted. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** MIME types accepted for lesson-plan and library uploads: PDF, image, Word, PowerPoint. */
export const ACCEPTED = /^(application\/pdf|image\/|application\/(msword|vnd\.openxmlformats-officedocument\.|vnd\.ms-powerpoint))/;

/** Shared upload rule (5 MB; PDF, image, Word, PowerPoint). Returns the message to show, or undefined. */
export function validateUploadFile(file: File): string | undefined {
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
  if (!ACCEPTED.test(file.type)) return "Upload a PDF, image, Word, or PowerPoint file.";
  return undefined;
}

export function largeFileKey(attachmentId: string) {
  return `${IDB_PREFIX}${attachmentId}`;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function idb<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return openDb().then((db) => new Promise<T | undefined>((resolve, reject) => {
    if (!db) return reject(new Error("IndexedDB is unavailable."));
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  }));
}

/** Stores a data URL in IndexedDB (memory when unavailable). Resolves false on failure. */
export async function saveLargeFile(storageKey: string, dataUrl: string): Promise<boolean> {
  if (typeof indexedDB === "undefined") {
    memoryFiles.set(storageKey, dataUrl);
    return true;
  }
  try {
    await idb("readwrite", (store) => store.put(dataUrl, storageKey));
    return true;
  } catch {
    return false;
  }
}

/** Reads any stored file, small or large. */
export async function readFileAsync(storageKey: string | undefined): Promise<string | undefined> {
  if (!storageKey) return undefined;
  if (!storageKey.startsWith(IDB_PREFIX)) return readFile(storageKey);
  if (typeof indexedDB === "undefined") return memoryFiles.get(storageKey);
  try {
    return await idb<string>("readonly", (store) => store.get(storageKey));
  } catch {
    return undefined;
  }
}
