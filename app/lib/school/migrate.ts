import { studentLessons as legacyStudentLessonSeed, studentTransactionSeed } from "../data";
import { addMinutes } from "../student";
import type { CreditTransaction, StudentLesson, TeacherLesson, TeacherSlotClosure, TeacherSlotOpening } from "../types";
import { fileStorageKey, saveFile } from "./files";
import { createId, get, list, query, remove, upsert } from "./repositories";
import { creditBalance, findUserByEmail } from "./selectors";
import type { SchoolData } from "./types";

/**
 * One-time import of the per-user workspaces used before the shared store (ADMIN_PLAN.md
 * section 8). Shared facts (lessons, slots, requests, credits) move into the school store;
 * personal fields (profile, settings, notes, tasks, practice) stay in the role workspaces.
 */

const TEACHER_PREFIX = "lumina-teacher-workspace:";
const STUDENT_PREFIX = "lumina-student-workspace:";

type LegacyTeacher = { lessons?: TeacherLesson[]; closedSlots?: TeacherSlotClosure[]; openedSlots?: TeacherSlotOpening[] };
type LegacyStudent = { lessons?: StudentLesson[]; creditHours?: number; transactions?: CreditTransaction[] };

function readJson<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeTimestamp(value: string | undefined, fallback: string) {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? fallback : new Date(time).toISOString();
}

function userIdByName(draft: SchoolData, name: string | undefined, fallback: string) {
  if (!name) return fallback;
  return list(draft, "users").find((user) => user.name === name)?.id ?? fallback;
}

function adminId(draft: SchoolData) {
  return list(draft, "users").find((user) => user.role === "admin")?.id ?? "";
}

function migrateTeacher(draft: SchoolData, teacherId: string, legacy: LegacyTeacher) {
  const now = new Date().toISOString();

  legacy.lessons?.forEach((old) => {
    const existing = get(draft, "lessons", old.id);
    const changes = {
      date: old.date, time: old.time, endTime: old.endTime || addMinutes(old.time, 25), title: old.title, focus: old.focus,
      status: old.status, notes: old.notes, homework: old.homework, attendance: old.attendance, feedback: old.feedback, cancelReason: old.cancelReason,
    };
    if (existing) {
      upsert(draft, "lessons", { ...existing, ...changes });
    } else if (old.studentId && get(draft, "users", old.studentId)) {
      upsert(draft, "lessons", { id: old.id, teacherId, studentId: old.studentId, roomCode: old.roomCode, createdBy: teacherId, createdAt: now, ...changes });
    } else {
      return;
    }

    if (old.cancellation) {
      const c = old.cancellation;
      let attachmentId: string | undefined;
      if (c.attachment?.dataUrl) {
        attachmentId = createId("attachment");
        const storageKey = fileStorageKey(attachmentId);
        if (saveFile(storageKey, c.attachment.dataUrl)) {
          upsert(draft, "attachments", { id: attachmentId, name: c.attachment.name, type: c.attachment.type, size: c.attachment.dataUrl.length, storageKey, uploadedBy: teacherId, uploadedAt: c.requestedAt || now });
        } else {
          attachmentId = undefined;
        }
      }
      query(draft, "requests", (request) => request.type === "lesson-cancellation" && request.lessonId === old.id).forEach((request) => remove(draft, "requests", request.id));
      upsert(draft, "requests", {
        id: `request-cancel-${old.id}`, type: "lesson-cancellation", lessonId: old.id, teacherId, reason: c.reason, comment: c.comment, attachmentId,
        status: c.status, requestedAt: c.requestedAt || now, requestedBy: teacherId,
        reviewedBy: c.reviewedBy ? userIdByName(draft, c.reviewedBy, adminId(draft)) : undefined, reviewedAt: c.reviewedAt, reviewNote: c.reviewNote,
      });
    }
  });

  if (Array.isArray(legacy.closedSlots)) {
    query(draft, "requests", (request) => request.type === "slot-closure" && request.teacherId === teacherId).forEach((request) => remove(draft, "requests", request.id));
    legacy.closedSlots.forEach((closure) => {
      if (!closure.date || !closure.time) return;
      upsert(draft, "requests", {
        id: closure.id || createId("request"), type: "slot-closure", teacherId, date: closure.date, time: closure.time, reason: closure.reason || "Closed by teacher",
        status: closure.status ?? "approved", requestedAt: closure.requestedAt || now, requestedBy: teacherId,
        reviewedBy: closure.reviewedBy ? userIdByName(draft, closure.reviewedBy, adminId(draft)) : undefined, reviewedAt: closure.reviewedAt, reviewNote: closure.reviewNote,
      });
    });
  }

  // Openings are merged (not replaced) so the fresh seed keeps bookable slots in the coming days.
  if (Array.isArray(legacy.openedSlots)) {
    legacy.openedSlots.forEach((opening) => {
      if (!opening.date || !opening.time) return;
      const duplicate = query(draft, "slotOpenings", (item) => item.teacherId === teacherId && item.date === opening.date && item.time === opening.time).length > 0;
      if (duplicate) return;
      upsert(draft, "slotOpenings", { id: `opening-${teacherId}-${opening.date}-${opening.time}`, teacherId, date: opening.date, time: opening.time, openedAt: opening.openedAt || now, openedBy: teacherId });
    });
  }
}

const seededStudentLessonIds = new Set(legacyStudentLessonSeed.map((lesson) => lesson.id));
const seededTransactionIds = new Set(studentTransactionSeed.map((txn) => txn.id));

function migrateStudent(draft: SchoolData, studentId: string, legacy: LegacyStudent) {
  const now = new Date().toISOString();

  // Lessons the student booked themselves with a real teacher. Demo seed lessons with fictional tutors are dropped.
  legacy.lessons?.forEach((old) => {
    if (seededStudentLessonIds.has(old.id) || get(draft, "lessons", old.id)) return;
    const teacher = list(draft, "users").find((user) => user.role === "teacher" && user.name === old.tutor);
    if (!teacher) return;
    upsert(draft, "lessons", {
      id: old.id, teacherId: teacher.id, studentId, date: old.date, time: old.time, endTime: old.endTime || addMinutes(old.time, 25), title: old.title, focus: old.focus,
      status: old.status === "upcoming" ? "scheduled" : old.status, roomCode: old.roomCode, notes: old.notes, homework: old.homework, feedback: old.feedback,
      corrections: old.corrections, scores: old.scores, cancelReason: old.cancelReason, createdBy: studentId, createdAt: now,
    });
  });

  legacy.transactions?.forEach((txn) => {
    if (seededTransactionIds.has(txn.id)) return;
    upsert(draft, "credits", { id: `credit-${studentId}-${txn.id}`, studentId, hours: txn.hours, amount: txn.amount, reason: txn.status === "refunded" ? "refund" : "purchase", description: txn.description, actorId: studentId, createdAt: safeTimestamp(txn.date, now) });
  });

  if (typeof legacy.creditHours === "number" && Number.isFinite(legacy.creditHours)) {
    const difference = Number((legacy.creditHours - creditBalance(draft, studentId)).toFixed(2));
    if (Math.abs(difference) >= 0.01) {
      upsert(draft, "credits", { id: createId("credit"), studentId, hours: difference, reason: "adjustment", description: "Balance carried over from your previous workspace", actorId: studentId, createdAt: now });
    }
  }
}

/** Applies every legacy workspace found in `storage` to the draft. Safe to run on any data. */
export function migrateLegacyWorkspaces(draft: SchoolData, storage: Storage) {
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (key.startsWith(TEACHER_PREFIX)) {
      const teacher = findUserByEmail(draft, key.slice(TEACHER_PREFIX.length));
      const legacy = readJson<LegacyTeacher>(storage, key);
      if (teacher?.role === "teacher" && legacy) migrateTeacher(draft, teacher.id, legacy);
    } else if (key.startsWith(STUDENT_PREFIX)) {
      const student = findUserByEmail(draft, key.slice(STUDENT_PREFIX.length));
      const legacy = readJson<LegacyStudent>(storage, key);
      if (student?.role === "student" && legacy) migrateStudent(draft, student.id, legacy);
    }
  }
  draft.migratedAt = new Date().toISOString();
}
