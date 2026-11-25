import { request } from "../../api/client";
import type { SchoolData } from "../types";

/** Response of `POST /school/import/preview` and `POST /school/import` (see `backend/src/routes/school-import.ts`). */
export type ImportCount = {
  created: number;
  adopted: number;
  dropped: number;
  skippedSeed: number;
};

export type ImportWarning = {
  code: string;
  collection: string;
  localId: string;
  message: string;
};

export type ImportResult = {
  dryRun: boolean;
  marker: string;
  alreadyImported: boolean;
  settingsApplied: boolean;
  pendingUploads: number;
  totals: ImportCount;
  counts: Record<string, ImportCount>;
  idMap: Record<string, string>;
  createdIds: Record<string, string[]>;
  warnings: ImportWarning[];
  warningsTruncated: boolean;
};

export type ImportOptions = {
  includeSeedRecords?: boolean;
  importSettings?: boolean;
  force?: boolean;
};

export type ImportRequest = {
  source: SchoolData;
  /** Local attachment id -> id returned by `POST /uploads` for the same bytes. */
  attachments: Record<string, string>;
  exclude: Record<string, string[]>;
  options: ImportOptions;
};

export function previewImport(body: ImportRequest): Promise<ImportResult> {
  return request<ImportResult>("/school/import/preview", { method: "POST", body });
}

export function runImport(body: ImportRequest): Promise<ImportResult> {
  return request<ImportResult>("/school/import", { method: "POST", body });
}
