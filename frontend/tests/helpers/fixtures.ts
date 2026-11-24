import { expect } from "vitest";
import { getSchoolSnapshot, updateSchool, type Lesson, type LibraryItem } from "@/app/lib/school";
import { patch, upsert } from "@/app/lib/school/repositories";
import { bookLesson } from "@/app/lib/school/services/bookings";
import { openSlot } from "@/app/lib/school/services/teaching";
import { sync } from "./school";

/** Opens the teacher's slot and books it as the student; returns the new lesson. */
export function bookAs(studentId: string, teacherId: string, date: string, time: string): Lesson {
  expect(sync(openSlot(teacherId, date, time)).ok).toBe(true);
  const result = sync(bookLesson(studentId, { teacherId, date, time, title: "Speaking", focus: [] }));
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export function setLessonStatus(lessonId: string, status: Lesson["status"]) {
  updateSchool((draft) => { patch(draft, "lessons", lessonId, { status }); });
}

/** Test-only library item (the seed has none, and the create path needs FileReader + IndexedDB). */
export function addLibraryItem(id: string, createdBy: string, status: LibraryItem["status"] = "published"): LibraryItem {
  const now = new Date().toISOString();
  const item: LibraryItem = { id, title: `Item ${id}`, category: "Grammar", tags: [], attachmentId: `attachment-${id}`, createdBy, status, createdAt: now, updatedAt: now };
  updateSchool((draft) => { upsert(draft, "libraryItems", item); });
  return item;
}

/** How many activity rows match the action and target. */
export function activityCount(action: string, targetId: string): number {
  return Object.values(getSchoolSnapshot().collections.activity).filter((entry) => entry.action === action && entry.targetId === targetId).length;
}
