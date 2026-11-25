import { previewImport, runImport, type ImportOptions, type ImportResult } from "../api/import";
import { uploadFile } from "../api/uploads";
import { MAX_UPLOAD_BYTES } from "../files";
import {
  archivePendingImport,
  clearPendingImport,
  readPendingImport,
  type PendingImport,
} from "./capture";
import {
  attachmentsWithBytes,
  dataUrlToFile,
  diffAgainstSeed,
  readAttachmentData,
  type SeedDiff,
} from "./plan";

/**
 * Client side of the one-time import.
 *
 * Preview runs before any upload (it must not write anything). The real import
 * first pushes attachment bytes through `POST /uploads`, then sends one payload
 * whose `attachments` map points the server at those rows.
 *
 * On success the pending capture is archived to `lumina-school:imported:<seededAt>`
 * and cleared, so the same browser does not offer the same import twice.
 */

export type ImportPreview = {
  result: ImportResult;
  diff: SeedDiff;
  pending: PendingImport;
};

export type ImportRun = ImportResult & {
  archivedKey: string | null;
  uploadFailures: string[];
};

function pendingOrThrow(): PendingImport {
  const pending = readPendingImport();
  if (!pending) {
    throw new Error("No local school is waiting to be imported on this browser.");
  }
  return pending;
}

export async function previewPendingImport(options: ImportOptions = {}): Promise<ImportPreview> {
  const pending = pendingOrThrow();
  const diff = diffAgainstSeed(pending.data);
  const result = await previewImport({
    source: pending.data,
    attachments: {},
    exclude: diff.exclude,
    options,
  });
  return { result, diff, pending };
}

export async function importPending(options: ImportOptions = {}): Promise<ImportRun> {
  const pending = pendingOrThrow();
  const diff = diffAgainstSeed(pending.data);
  const uploads: Record<string, string> = {};
  const uploadFailures: string[] = [];

  for (const attachment of attachmentsWithBytes(pending.data)) {
    const dataUrl = await readAttachmentData(attachment);
    if (!dataUrl) {
      uploadFailures.push(`${attachment.name}: the file is no longer stored in this browser.`);
      continue;
    }
    const file = dataUrlToFile(attachment, dataUrl);
    if (!file) {
      uploadFailures.push(`${attachment.name}: the stored file could not be read.`);
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      uploadFailures.push(`${attachment.name}: larger than 5 MB, so it was skipped.`);
      continue;
    }
    try {
      const uploaded = await uploadFile(file);
      uploads[attachment.id] = uploaded.id;
    } catch (error) {
      uploadFailures.push(
        `${attachment.name}: ${error instanceof Error ? error.message : "upload failed"}`,
      );
    }
  }

  const result = await runImport({
    source: pending.data,
    attachments: uploads,
    exclude: diff.exclude,
    options,
  });
  const archivedKey = archivePendingImport();
  clearPendingImport();
  return { ...result, archivedKey, uploadFailures };
}

/** The receipt is the only rollback path without a schema change: every created id, by collection. */
export function buildReceipt(run: ImportRun): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      marker: run.marker,
      totals: run.totals,
      counts: run.counts,
      createdIds: run.createdIds,
      idMap: run.idMap,
      warnings: run.warnings,
      warningsTruncated: run.warningsTruncated,
      uploadFailures: run.uploadFailures,
      archivedKey: run.archivedKey,
    },
    null,
    2,
  );
}
