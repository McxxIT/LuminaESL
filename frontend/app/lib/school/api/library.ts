import { request } from "../../api/client";
import type { LessonLibraryLink, LibraryItem, LibraryItemStatus } from "../types";
import { refreshSchoolAfterCommand } from "./school";

/**
 * Curriculum Library commands (API mode). Reads come from `GET /school/bootstrap`; file bytes
 * go through `api/uploads.ts` `uploadFile` first. Every command refreshes the school store.
 */

type Method = "POST" | "PATCH" | "DELETE";

async function command<T>(path: string, method: Method, body?: unknown): Promise<T> {
  const value = await request<T>(path, { method, ...(body === undefined ? {} : { body }) });
  await refreshSchoolAfterCommand();
  return value;
}

export type LibraryItemCommand = {
  title: string;
  category: string;
  level?: string;
  description?: string;
  tags?: string[];
};

export const createLibraryItem = (attachmentId: string, input: LibraryItemCommand) =>
  command<LibraryItem>("/library", "POST", { attachmentId, ...input });

export const updateLibraryItem = (id: string, input: Partial<LibraryItemCommand> & { status?: LibraryItemStatus }) =>
  command<LibraryItem>(`/library/${encodeURIComponent(id)}`, "PATCH", input);

export const attachLibraryItem = (lessonId: string, libraryItemId: string) =>
  command<LessonLibraryLink>(`/lessons/${encodeURIComponent(lessonId)}/library-items`, "POST", { libraryItemId });

export const detachLibraryItem = (lessonId: string, libraryItemId: string) =>
  command<void>(`/lessons/${encodeURIComponent(lessonId)}/library-items/${encodeURIComponent(libraryItemId)}`, "DELETE");
