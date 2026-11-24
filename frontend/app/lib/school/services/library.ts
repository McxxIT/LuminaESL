import { isApiDataMode } from "../../auth/mode";
import {
  attachLibraryItem as attachLibraryItemApi,
  createLibraryItem as createLibraryItemApi,
  detachLibraryItem as detachLibraryItemApi,
  updateLibraryItem as updateLibraryItemApi,
} from "../api/library";
import { uploadFile as uploadFileApi } from "../api/uploads";
import { largeFileKey, MAX_UPLOAD_BYTES, saveLargeFile } from "../files";
import { assertCan } from "../permissions";
import { createId, get, patch, recordActivity, remove, upsert } from "../repositories";
import { updateSchool } from "../store";
import type { LessonLibraryLink, LibraryItem, LibraryItemStatus, SchoolData } from "../types";
import { requireLesson, requireUser } from "./common";
import { fail, run, runAsync, ServiceError, type ServiceCall, type ServiceResult } from "./result";

/**
 * Curriculum Library: one global, school-wide library of reusable files.
 * - admin and managers add items (one file each); the creator or an admin edits/archives them
 * - admin attaches to any lesson; a manager to lessons of a teacher on their team
 * - teachers and students only view materials linked to their own lessons
 * Archive-only: archived items leave browse and new attaches, existing links keep working.
 * The local branch mirrors the backend rules and activity action names in `routes/library.ts`.
 */

/** Same file rules as `services/uploads.ts` (5 MB; PDF, image, Word, PowerPoint). */
const ACCEPTED = /^(application\/pdf|image\/|application\/(msword|vnd\.openxmlformats-officedocument\.|vnd\.ms-powerpoint))/;

function validateFile(file: File): string | undefined {
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
  if (!ACCEPTED.test(file.type)) return "Upload a PDF, image, Word, or PowerPoint file.";
  return undefined;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export type LibraryItemInput = {
  title: string;
  category: string;
  level?: string;
  description?: string;
  /** Array, or a comma-separated string from a text field. */
  tags?: string[] | string;
};

type CleanInput = { title: string; category: string; level?: string; description?: string; tags: string[] };

/** Same limits as the backend zod schema: title/category 1-200, level 50, description 2000, 20 x 50 tags. */
function cleanInput(input: LibraryItemInput): CleanInput {
  const title = input.title.trim();
  const category = input.category.trim();
  const level = input.level?.trim() ?? "";
  const description = input.description?.trim() ?? "";
  const tags = [...new Set((Array.isArray(input.tags) ? input.tags : (input.tags ?? "").split(",")).map((tag) => tag.trim()).filter(Boolean))];
  if (!title || title.length > 200) throw new ServiceError("Enter a title (up to 200 characters).");
  if (!category || category.length > 200) throw new ServiceError("Enter a category (up to 200 characters).");
  if (level.length > 50) throw new ServiceError("Keep the level under 50 characters.");
  if (description.length > 2000) throw new ServiceError("Keep the description under 2000 characters.");
  if (tags.length > 20 || tags.some((tag) => tag.length > 50)) throw new ServiceError("Use up to 20 tags of at most 50 characters each.");
  return { title, category, level: level || undefined, description: description || undefined, tags };
}

function toCommand(input: CleanInput) {
  return {
    title: input.title,
    category: input.category,
    ...(input.level ? { level: input.level } : {}),
    ...(input.description ? { description: input.description } : {}),
    tags: input.tags,
  };
}

function requireEditableItem(draft: SchoolData, actorId: string, itemId: string): LibraryItem {
  const actor = requireUser(draft, actorId);
  const item = get(draft, "libraryItems", itemId);
  if (!item) throw new ServiceError("That library item no longer exists.");
  assertCan(draft, actor, "library.edit", { libraryItemId: itemId });
  return item;
}

export const lessonLibraryLinkId = (lessonId: string, libraryItemId: string) => `${lessonId}:${libraryItemId}`;

/** Uploads the file (API, or IndexedDB in demo mode) and adds it to the library as a new item. */
export async function createLibraryItem(actorId: string, file: File, input: LibraryItemInput): Promise<ServiceResult<LibraryItem>> {
  const invalid = validateFile(file);
  if (invalid) return fail(invalid);
  let clean: CleanInput;
  try {
    clean = cleanInput(input);
  } catch (error) {
    if (error instanceof ServiceError) return fail(error.message);
    throw error;
  }

  if (isApiDataMode()) {
    return runAsync(async () => {
      const attachment = await uploadFileApi(file);
      return createLibraryItemApi(attachment.id, toCommand(clean));
    });
  }

  let dataUrl: string;
  try {
    dataUrl = await readAsDataUrl(file);
  } catch {
    return fail(`Could not read ${file.name}. Try another file.`);
  }
  const attachmentId = createId("attachment");
  const storageKey = largeFileKey(attachmentId);
  if (!(await saveLargeFile(storageKey, dataUrl))) return fail("The browser refused to store this file. Free some space and try again.");

  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "library.manage");
    const now = new Date().toISOString();
    upsert(draft, "attachments", { id: attachmentId, name: file.name, type: file.type, size: file.size, storageKey, uploadedBy: actor.id, uploadedAt: now });
    const item = upsert(draft, "libraryItems", { id: createId("library"), ...clean, attachmentId, createdBy: actor.id, createdByName: actor.name, status: "published", createdAt: now, updatedAt: now });
    recordActivity(draft, { actorId, action: "library.created", targetType: "libraryItem", targetId: item.id, summary: `Added "${item.title}" (${file.name}) to the library` });
    return item;
  }));
}

/** Edits the title, category, level, description, or tags. The file never changes. */
export function updateLibraryItem(actorId: string, itemId: string, input: LibraryItemInput): ServiceCall {
  if (isApiDataMode()) {
    return runAsync(async () => {
      const clean = cleanInput(input);
      // Send empty strings so clearing a field clears it on the server.
      await updateLibraryItemApi(itemId, { ...toCommand(clean), level: clean.level ?? "", description: clean.description ?? "" });
    });
  }
  return run(() => updateSchool((draft) => {
    const item = requireEditableItem(draft, actorId, itemId);
    const clean = cleanInput(input);
    patch(draft, "libraryItems", itemId, { ...clean, updatedAt: new Date().toISOString() });
    recordActivity(draft, { actorId, action: "library.updated", targetType: "libraryItem", targetId: itemId, summary: `Updated library item "${clean.title || item.title}"` });
  }));
}

/** Archive (hide from browse and new attaches; existing links keep access) or unarchive. */
export function setLibraryItemStatus(actorId: string, itemId: string, status: LibraryItemStatus): ServiceCall {
  if (isApiDataMode()) return runAsync(async () => { await updateLibraryItemApi(itemId, { status }); });
  return run(() => updateSchool((draft) => {
    const item = requireEditableItem(draft, actorId, itemId);
    const archiving = status === "archived" && item.status !== "archived";
    patch(draft, "libraryItems", itemId, { status, updatedAt: new Date().toISOString() });
    recordActivity(draft, {
      actorId,
      action: archiving ? "library.archived" : "library.updated",
      targetType: "libraryItem",
      targetId: itemId,
      summary: archiving ? `Archived library item "${item.title}"` : `Updated library item "${item.title}"`,
    });
  }));
}

/** Links a published item to a scheduled or live lesson. Repeating it is a no-op. */
export function attachLibraryItem(actorId: string, lessonId: string, libraryItemId: string): ServiceCall {
  if (isApiDataMode()) return runAsync(async () => { await attachLibraryItemApi(lessonId, libraryItemId); });
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const lesson = requireLesson(draft, lessonId);
    assertCan(draft, actor, "lesson.attachLibraryItem", { lessonId });
    const item = get(draft, "libraryItems", libraryItemId);
    if (!item) throw new ServiceError("That library item no longer exists.");
    if (item.status !== "published") throw new ServiceError("Archived library items cannot be attached.");
    if (lesson.status !== "scheduled" && lesson.status !== "live") throw new ServiceError("Materials can only be attached to scheduled or live lessons.");
    const id = lessonLibraryLinkId(lessonId, libraryItemId);
    if (get(draft, "lessonLibraryItems", id)) return;
    const link: LessonLibraryLink = { id, lessonId, libraryItemId, attachedBy: actor.id, attachedAt: new Date().toISOString() };
    upsert(draft, "lessonLibraryItems", link);
    recordActivity(draft, { actorId, action: "lesson.libraryAttached", targetType: "lesson", targetId: lessonId, summary: `Attached "${item.title}" to lesson "${lesson.title}"` });
  }));
}

/** Removes a material from a lesson (any lesson status). Removing a missing link is a no-op. */
export function detachLibraryItem(actorId: string, lessonId: string, libraryItemId: string): ServiceCall {
  if (isApiDataMode()) return runAsync(async () => { await detachLibraryItemApi(lessonId, libraryItemId); });
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const lesson = requireLesson(draft, lessonId);
    assertCan(draft, actor, "lesson.attachLibraryItem", { lessonId });
    const item = get(draft, "libraryItems", libraryItemId);
    if (!item) throw new ServiceError("That library item no longer exists.");
    if (!remove(draft, "lessonLibraryItems", lessonLibraryLinkId(lessonId, libraryItemId))) return;
    recordActivity(draft, { actorId, action: "lesson.libraryDetached", targetType: "lesson", targetId: lessonId, summary: `Removed "${item.title}" from lesson "${lesson.title}"` });
  }));
}
