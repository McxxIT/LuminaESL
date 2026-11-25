import path from "node:path";

type PathImpl = Pick<typeof path, "resolve" | "relative" | "isAbsolute" | "sep">;

/**
 * Resolves a stored attachment key to a file path inside the upload directory.
 * Returns null when the key is empty, contains NUL or `:` (drive letters, Windows
 * alternate data streams), or resolves to the directory itself or anywhere outside it.
 * Pure path arithmetic: no filesystem access and no symlink resolution (UPLOAD_DIR is
 * server-controlled). `pathImpl` is injectable so Windows semantics can be tested on any OS.
 */
export function resolveUploadPath(
  uploadDir: string,
  storageKey: string,
  pathImpl: PathImpl = path,
): string | null {
  if (!storageKey || storageKey.includes("\0") || storageKey.includes(":")) {
    return null;
  }
  const root = pathImpl.resolve(uploadDir);
  const target = pathImpl.resolve(root, storageKey);
  const rel = pathImpl.relative(root, target);
  if (
    rel === "" ||
    rel === ".." ||
    rel.startsWith(".." + pathImpl.sep) ||
    pathImpl.isAbsolute(rel)
  ) {
    return null;
  }
  return target;
}
