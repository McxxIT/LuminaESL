import { buildDaySlots, isSlotInPast } from "../scheduling";
import { initials, parseISODate, toISODate } from "../student";
import { computeTeacherPerformance, type PerformanceRules, type TeacherPerformance } from "../teacherPerformance";
import type { CreditTransaction, LessonLibraryMaterial, StudentAssignment, StudentLesson, TeacherHomework, TeacherLesson, TeacherLessonMaterial, TeacherSlotClosure, TeacherSlotOpening } from "../types";
import { isApiDataMode } from "../auth/mode";
import { readFile } from "./files";
import { get, list, query } from "./repositories";
import { libraryForLesson, lessonsForStudent, lessonsForTeacher, plansForCourse, ratingsForLesson } from "./selectors";
import type { Assignment, Lesson, LessonCancellationRequest, SchoolData, SlotClosureRequest } from "./types";

/**
 * Adapters from shared-store records to the view shapes existing screens already render.
 * They let teacher/student screens move onto the store (phase 1) without rewriting their UI,
 * and let manager screens reuse teacher components such as the performance score.
 */

export function nameOf(data: SchoolData, userId: string | null | undefined, fallback = "Unknown") {
  return get(data, "users", userId)?.name ?? fallback;
}

export function lessonMaterialView(data: SchoolData, lesson: Lesson): TeacherLessonMaterial | undefined {
  const plan = get(data, "lessonPlans", lesson.lessonPlanId);
  if (!plan) return undefined;
  const courseId = get(data, "courseUnits", plan.unitId)?.courseId;
  const coursePlans = courseId ? plansForCourse(data, courseId) : [];
  const index = coursePlans.findIndex((item) => item.id === plan.id);
  return {
    courseTitle: get(data, "courses", courseId)?.title,
    position: index >= 0 ? index + 1 : undefined,
    total: coursePlans.length || undefined,
    id: plan.id,
    title: plan.title,
    fileName: `${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "lesson-plan"}.txt`,
    summary: plan.summary,
    sections: plan.sections,
    assignedBy: nameOf(data, lesson.planAttachedBy, "Manager"),
    assignedAt: (lesson.planAttachedAt ?? plan.updatedAt).slice(0, 10),
    files: plan.attachmentIds.flatMap((id) => {
      const file = get(data, "attachments", id);
      return file ? [{ id: file.id, name: file.name, type: file.type, size: file.size, storageKey: file.storageKey }] : [];
    }),
  };
}

/**
 * Curriculum Library files linked to a lesson, for the teacher and student lesson views. A
 * cancelled lesson shows none (the backend also stops serving them for cancelled lessons).
 */
export function lessonLibraryMaterialsView(data: SchoolData, lesson: Lesson): LessonLibraryMaterial[] {
  if (lesson.status === "cancelled") return [];
  return libraryForLesson(data, lesson.id).flatMap((item) => {
    const file = get(data, "attachments", item.attachmentId);
    return file
      ? [{ id: item.id, title: item.title, category: item.category, attachmentId: file.id, fileName: file.name, type: file.type, size: file.size, storageKey: file.storageKey }]
      : [];
  });
}

/** A shared lesson as the teacher screens see it (`TeacherLesson`). */
export function toTeacherLessonView(data: SchoolData, lesson: Lesson): TeacherLesson {
  const student = get(data, "users", lesson.studentId);
  const cancellation = query(data, "requests", (request) => request.type === "lesson-cancellation" && request.lessonId === lesson.id)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0] as LessonCancellationRequest | undefined;
  const absence = query(data, "absences", (item) => item.lessonId === lesson.id)[0];
  const ratings = query(data, "ratings", (rating) => rating.lessonId === lesson.id);

  return {
    id: lesson.id,
    date: lesson.date,
    time: lesson.time,
    endTime: lesson.endTime,
    duration: 25,
    title: lesson.title,
    focus: lesson.focus,
    studentId: lesson.studentId,
    studentName: student?.name ?? "Student",
    studentInitials: initials(student?.name ?? "Student"),
    studentColor: student?.avatarColor ?? "indigo",
    status: lesson.status,
    roomCode: lesson.roomCode,
    notes: lesson.notes,
    homework: lesson.homework,
    attendance: lesson.attendance,
    feedback: lesson.feedback,
    cancelReason: lesson.cancelReason,
    cancellation: cancellation && {
      reason: cancellation.reason,
      comment: cancellation.comment ?? "",
      attachment: attachmentView(data, cancellation.attachmentId),
      status: cancellation.status,
      requestedAt: cancellation.requestedAt,
      requestedBy: nameOf(data, cancellation.requestedBy),
      reviewedAt: cancellation.reviewedAt,
      reviewedBy: cancellation.reviewedBy ? nameOf(data, cancellation.reviewedBy) : undefined,
      reviewNote: cancellation.reviewNote,
    },
    material: lessonMaterialView(data, lesson),
    libraryMaterials: lessonLibraryMaterialsView(data, lesson),
    ratings: ratings.length ? ratings.map((rating) => ({ from: rating.from, name: rating.authorName, score: rating.score, comment: rating.comment, ratedAt: rating.createdAt.slice(0, 10) })) : undefined,
    teacherAbsence: absence && { note: absence.note, reportedBy: nameOf(data, absence.reportedBy), reportedAt: absence.reportedAt },
  };
}

/** Teacher performance score from shared data, using the same rules as the teacher's Analytics page. */
export function performanceForTeacher(data: SchoolData, teacherId: string): TeacherPerformance {
  return computeTeacherPerformance(lessonsForTeacher(data, teacherId).map((lesson) => toTeacherLessonView(data, lesson)), performanceRules(data));
}

/** Scoring rules from the admin's school settings. */
export function performanceRules(data: SchoolData): PerformanceRules {
  return { onTheSpotHours: data.settings.onTheSpotCancellationHours, windowDays: data.settings.performanceWindowDays };
}

/** File attached to a request. Bytes load on demand (`dataUrl`) in demo mode or by id in API mode. */
export function attachmentView(data: SchoolData, attachmentId: string | undefined) {
  const meta = get(data, "attachments", attachmentId);
  if (!meta) return undefined;
  const dataUrl = isApiDataMode() ? undefined : readFile(meta.storageKey);
  return dataUrl ? { id: meta.id, name: meta.name, type: meta.type, dataUrl } : { id: meta.id, name: meta.name, type: meta.type };
}

/** A teacher's slot rules in the shape `buildDaySlots` and the Booking slots page use. */
export function teacherScheduleView(data: SchoolData, teacherId: string) {
  const closedSlots: TeacherSlotClosure[] = (query(data, "requests", (request) => request.type === "slot-closure" && request.teacherId === teacherId) as SlotClosureRequest[])
    .filter((request) => request.status !== "rejected")
    .map((request) => ({
      id: request.id,
      date: request.date,
      time: request.time,
      reason: request.reason,
      status: request.status,
      requestedAt: request.requestedAt,
      requestedBy: nameOf(data, request.requestedBy),
      reviewedAt: request.reviewedAt,
      reviewedBy: request.reviewedBy ? nameOf(data, request.reviewedBy) : undefined,
      reviewNote: request.reviewNote,
    }));
  const openedSlots: TeacherSlotOpening[] = query(data, "slotOpenings", (opening) => opening.teacherId === teacherId)
    .map((opening) => ({ id: opening.id, date: opening.date, time: opening.time, openedAt: opening.openedAt, openedBy: nameOf(data, opening.openedBy) }));
  const lessons = lessonsForTeacher(data, teacherId).map((lesson) => toTeacherLessonView(data, lesson));
  return { closedSlots, openedSlots, lessons };
}

/** A shared lesson as the student screens see it (`StudentLesson`). Scheduled and live both read as "upcoming". */
export function toStudentLessonView(data: SchoolData, lesson: Lesson): StudentLesson {
  const teacher = get(data, "users", lesson.teacherId);
  const plan = get(data, "lessonPlans", lesson.lessonPlanId);
  return {
    id: lesson.id,
    date: lesson.date,
    time: lesson.time,
    endTime: lesson.endTime,
    duration: 25,
    title: lesson.title,
    tutor: teacher?.name ?? "Teacher",
    tutorId: lesson.teacherId,
    tutorInitials: initials(teacher?.name ?? "Teacher"),
    tutorColor: teacher?.avatarColor ?? "indigo",
    focus: lesson.focus,
    status: lesson.status === "completed" ? "completed" : lesson.status === "cancelled" ? "cancelled" : "upcoming",
    roomCode: lesson.roomCode,
    notes: lesson.notes ?? (plan ? plan.summary : undefined),
    homework: lesson.homework,
    feedback: lesson.feedback,
    corrections: lesson.corrections,
    scores: lesson.scores,
    cancelReason: lesson.cancelReason,
    attendance: lesson.attendance,
    ratings: ratingsForLesson(data, lesson.id).map((rating) => ({ from: rating.from, score: rating.score, comment: rating.comment })),
    materials: lessonLibraryMaterialsView(data, lesson),
  };
}

export function studentLessonsView(data: SchoolData, studentId: string): StudentLesson[] {
  return lessonsForStudent(data, studentId).map((lesson) => toStudentLessonView(data, lesson));
}

/** Purchases and refunds as billing history (lesson debits are not invoices, so they are left out). */
export function creditTransactionsView(data: SchoolData, studentId: string): CreditTransaction[] {
  return query(data, "credits", (entry) => entry.studentId === studentId && (entry.reason === "purchase" || entry.reason === "refund"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((entry) => ({
      id: entry.id,
      date: new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      description: entry.description,
      hours: Number(entry.hours.toFixed(2)),
      amount: entry.amount ?? 0,
      status: entry.reason === "refund" ? "refunded" as const : "paid" as const,
    }));
}

export type TeamWeekItem =
  | { kind: "lesson"; lesson: Lesson; time: string; endTime: string; teacherName: string; studentName: string; planTitle?: string; hasAbsence: boolean; started: boolean }
  | { kind: "open"; teacherId: string; teacherName: string; time: string; endTime: string };

export type TeamWeekDay = { date: string; items: TeamWeekItem[]; lessonCount: number; openCount: number };

function addDaysISO(date: string, days: number) {
  const value = parseISODate(date);
  value.setDate(value.getDate() + days);
  return toISODate(value);
}

/** Monday (ISO date) of the week containing `date`, shifted by `weekOffset` weeks. */
export function weekStartFor(date: string, weekOffset = 0) {
  const value = parseISODate(date);
  const mondayShift = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - mondayShift + weekOffset * 7);
  return toISODate(value);
}

/**
 * One week of lessons (and, when `showOpenSlots`, bookable slots) for the given teachers.
 * Past open slots are left out because they can no longer be booked.
 */
export function teamWeekView(data: SchoolData, teacherIds: string[], weekStart: string, showOpenSlots: boolean): TeamWeekDay[] {
  const schedules = teacherIds.map((teacherId) => ({ teacherId, name: nameOf(data, teacherId), schedule: teacherScheduleView(data, teacherId) }));
  const lessonsByTeacher = new Map(teacherIds.map((teacherId) => [teacherId, lessonsForTeacher(data, teacherId)]));
  const absentLessons = new Set(list(data, "absences").map((absence) => absence.lessonId));
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDaysISO(weekStart, index);
    const items: TeamWeekItem[] = [];
    let openCount = 0;
    schedules.forEach(({ teacherId, name, schedule }) => {
      (lessonsByTeacher.get(teacherId) ?? []).filter((lesson) => lesson.date === date).forEach((lesson) => {
        items.push({ kind: "lesson", lesson, time: lesson.time, endTime: lesson.endTime, teacherName: name, studentName: nameOf(data, lesson.studentId), planTitle: get(data, "lessonPlans", lesson.lessonPlanId)?.title, hasAbsence: absentLessons.has(lesson.id), started: isSlotInPast(lesson.date, lesson.time) });
      });
      buildDaySlots({ date, closures: schedule.closedSlots, openedSlots: schedule.openedSlots, lessons: schedule.lessons, includeClosed: false })
        .filter((slot) => !isSlotInPast(date, slot.time))
        .forEach((slot) => {
          openCount += 1;
          if (showOpenSlots) items.push({ kind: "open", teacherId, teacherName: name, time: slot.time, endTime: slot.endTime });
        });
    });
    items.sort((a, b) => a.time.localeCompare(b.time) || (a.kind === "lesson" ? -1 : 1));
    return { date, items, lessonCount: items.filter((item) => item.kind === "lesson").length, openCount };
  });
}

/** Open slots for one teacher on one day (for the book-on-behalf form). */
export function openSlotsForTeacher(data: SchoolData, teacherId: string, date: string) {
  const schedule = teacherScheduleView(data, teacherId);
  return buildDaySlots({ date, closures: schedule.closedSlots, openedSlots: schedule.openedSlots, lessons: schedule.lessons, includeClosed: false })
    .filter((slot) => !isSlotInPast(date, slot.time));
}

function shortDate(value: string | undefined) {
  return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
}

/** Homework as the student's Assignments page shows it. */
export function toStudentAssignmentView(data: SchoolData, assignment: Assignment): StudentAssignment {
  const status = assignment.status === "assigned" ? "pending" : assignment.status === "reviewed" ? "graded" : "submitted";
  return {
    id: assignment.id,
    title: assignment.title,
    type: assignment.type,
    dueLabel: assignment.dueLabel,
    tutor: nameOf(data, assignment.teacherId, "Teacher"),
    description: assignment.description,
    instructions: assignment.instructions,
    status,
    grade: assignment.grade,
    feedback: assignment.feedback,
    response: assignment.response,
    submittedAt: assignment.submittedAt ? new Date(assignment.submittedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : undefined,
  };
}

/** Homework as the teacher's roster shows it. */
export function toTeacherHomeworkView(assignment: Assignment): TeacherHomework & { response?: string } {
  return { id: assignment.id, title: assignment.title, assignedAt: shortDate(assignment.createdAt), dueLabel: assignment.dueLabel, status: assignment.status, feedback: assignment.feedback, response: assignment.response };
}
