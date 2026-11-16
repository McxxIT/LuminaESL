import { buildDaySlots, isSlotInPast, LESSON_SLOT_MINUTES, slotStartDate } from "../../scheduling";
import { addMinutes } from "../../student";
import { createId, get, query, recordActivity, upsert } from "../repositories";
import { creditBalance, plansForCourse } from "../selectors";
import type { Lesson, SchoolData, SchoolUser } from "../types";
import { teacherScheduleView } from "../views";
import { ServiceError } from "./result";

/** One 25-minute lesson costs this many credit hours (5 hours buys 12 lessons). */
export const LESSON_CREDIT_HOURS = LESSON_SLOT_MINUTES / 60;

export function requireUser(draft: SchoolData, userId: string): SchoolUser {
  const user = get(draft, "users", userId);
  if (!user) throw new ServiceError("Your account was not found in the school.");
  return user;
}

export function requireLesson(draft: SchoolData, lessonId: string): Lesson {
  const lesson = get(draft, "lessons", lessonId);
  if (!lesson) throw new ServiceError("That lesson no longer exists.");
  return lesson;
}

/** Throws unless the teacher's slot is open: opened, not closed or pending, not booked, not in the past. */
export function assertSlotOpen(draft: SchoolData, teacherId: string, date: string, time: string, excludedLessonId?: string) {
  if (get(draft, "users", teacherId)?.status !== "active") throw new ServiceError("This teacher is not taking bookings right now.");
  if (isSlotInPast(date, time)) throw new ServiceError("That time has already passed. Choose a future slot.");
  const schedule = teacherScheduleView(draft, teacherId);
  const slot = buildDaySlots({ date, closures: schedule.closedSlots, openedSlots: schedule.openedSlots, lessons: schedule.lessons, excludedLessonId, includeClosed: true })
    .find((item) => item.time === time);
  if (!slot || slot.status !== "open") throw new ServiceError("That slot is no longer open. Choose another time.");
}

export function hoursUntil(date: string, time: string) {
  return (slotStartDate(date, time).getTime() - Date.now()) / 3_600_000;
}

/** Adds a ledger entry. Debits throw when the student cannot afford them. */
export function changeCredits(draft: SchoolData, entry: { studentId: string; hours: number; reason: "booking" | "refund" | "purchase" | "adjustment"; description: string; actorId: string; lessonId?: string; amount?: number }) {
  if (entry.hours < 0 && creditBalance(draft, entry.studentId) + entry.hours < -0.001) {
    throw new ServiceError("Not enough lesson credits. Top up in Billing to book this lesson.");
  }
  return upsert(draft, "credits", { ...entry, id: createId("credit"), createdAt: new Date().toISOString() });
}

/**
 * The lesson plan the next booking on an enrollment should get: the enrollment's `nextPlanIndex`
 * plus however many upcoming lessons on that enrollment are already holding plans.
 */
export function nextPlanForEnrollment(draft: SchoolData, enrollmentId: string | undefined) {
  const enrollment = get(draft, "enrollments", enrollmentId);
  if (!enrollment || enrollment.status !== "active") return undefined;
  const plans = plansForCourse(draft, enrollment.courseId);
  const reserved = query(draft, "lessons", (lesson) => lesson.enrollmentId === enrollment.id && (lesson.status === "scheduled" || lesson.status === "live") && Boolean(lesson.lessonPlanId)).length;
  return plans[enrollment.nextPlanIndex + reserved];
}

export function activeEnrollmentFor(draft: SchoolData, studentId: string, teacherId: string) {
  return query(draft, "enrollments", (enrollment) => enrollment.studentId === studentId && enrollment.teacherId === teacherId && enrollment.status === "active")[0];
}

/** Creates a scheduled lesson with a room, the next lesson plan, and an activity entry. */
export function createLesson(draft: SchoolData, input: { teacherId: string; studentId: string; date: string; time: string; title: string; focus: string[]; notes?: string; actorId: string }) {
  const enrollment = activeEnrollmentFor(draft, input.studentId, input.teacherId);
  const plan = nextPlanForEnrollment(draft, enrollment?.id);
  // Plans are credited to the course owner (the manager who wrote them), not whoever booked.
  const planAuthor = enrollment ? get(draft, "courses", enrollment.courseId)?.ownerId : undefined;
  const now = new Date().toISOString();
  const lesson: Lesson = {
    id: createId("lesson"),
    enrollmentId: enrollment?.id,
    teacherId: input.teacherId,
    studentId: input.studentId,
    date: input.date,
    time: input.time,
    endTime: addMinutes(input.time, LESSON_SLOT_MINUTES),
    title: input.title,
    focus: input.focus,
    status: "scheduled",
    roomCode: `ESL-${Math.floor(1000 + Math.random() * 9000)}`,
    lessonPlanId: plan?.id,
    planAttachedBy: plan ? planAuthor ?? input.actorId : undefined,
    planAttachedAt: plan ? now : undefined,
    notes: input.notes,
    createdBy: input.actorId,
    createdAt: now,
  };
  upsert(draft, "lessons", lesson);
  recordActivity(draft, { actorId: input.actorId, action: "lesson.booked", targetType: "lesson", targetId: lesson.id, summary: `${input.title} on ${input.date} at ${input.time}` });
  return lesson;
}
