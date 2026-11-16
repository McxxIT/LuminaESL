import { addMinutes } from "../../student";
import { LESSON_SLOT_MINUTES } from "../../scheduling";
import { assertCan } from "../permissions";
import { patch, recordActivity } from "../repositories";
import { updateSchool } from "../store";
import type { Lesson } from "../types";
import { assertSlotOpen, changeCredits, createLesson, hoursUntil, LESSON_CREDIT_HOURS, requireLesson, requireUser } from "./common";
import { run, ServiceError, type ServiceResult } from "./result";

export type BookLessonInput = {
  teacherId: string;
  date: string;
  time: string;
  title: string;
  focus: string[];
  notes?: string;
};

/** A student books an open slot. Creates one lesson the teacher and manager see, and spends credits. */
export function bookLesson(actorId: string, input: BookLessonInput): ServiceResult<Lesson> {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "lesson.book", { studentId: actor.id, teacherId: input.teacherId });
    assertSlotOpen(draft, input.teacherId, input.date, input.time);
    const lesson = createLesson(draft, { ...input, studentId: actor.id, actorId });
    changeCredits(draft, { studentId: actor.id, hours: -LESSON_CREDIT_HOURS, reason: "booking", description: `${input.title} lesson`, actorId, lessonId: lesson.id });
    return lesson;
  }));
}

/** A teacher adds a lesson for one of their students in one of their own open slots. */
export function scheduleLessonForStudent(actorId: string, input: BookLessonInput & { studentId: string }): ServiceResult<Lesson> {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "lesson.schedule", { teacherId: input.teacherId });
    assertSlotOpen(draft, input.teacherId, input.date, input.time);
    const lesson = createLesson(draft, { ...input, actorId });
    changeCredits(draft, { studentId: input.studentId, hours: -LESSON_CREDIT_HOURS, reason: "booking", description: `${input.title} lesson (added by teacher)`, actorId, lessonId: lesson.id });
    return lesson;
  }));
}

export function rescheduleLesson(actorId: string, lessonId: string, date: string, time: string): ServiceResult<Lesson> {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const lesson = requireLesson(draft, lessonId);
    assertCan(draft, actor, "lesson.book", { lessonId });
    if (lesson.status !== "scheduled") throw new ServiceError("Only upcoming lessons can be rescheduled.");
    assertSlotOpen(draft, lesson.teacherId, date, time, lesson.id);
    recordActivity(draft, { actorId, action: "lesson.rescheduled", targetType: "lesson", targetId: lesson.id, summary: `Moved to ${date} at ${time}` });
    return patch(draft, "lessons", lesson.id, { date, time, endTime: addMinutes(time, LESSON_SLOT_MINUTES) })!;
  }));
}

/** Student cancellation. Refunded only when made at least `studentLateCancellationHours` ahead. */
export function cancelLessonByStudent(actorId: string, lessonId: string, reason: string): ServiceResult<{ refunded: boolean }> {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const lesson = requireLesson(draft, lessonId);
    assertCan(draft, actor, "lesson.book", { lessonId });
    if (lesson.status !== "scheduled") throw new ServiceError("Only upcoming lessons can be cancelled.");
    const refunded = hoursUntil(lesson.date, lesson.time) >= draft.settings.studentLateCancellationHours;
    patch(draft, "lessons", lesson.id, { status: "cancelled", cancelReason: reason || "Cancelled by student" });
    if (refunded) changeCredits(draft, { studentId: lesson.studentId, hours: LESSON_CREDIT_HOURS, reason: "refund", description: "Cancelled lesson credit return", actorId, lessonId: lesson.id });
    recordActivity(draft, { actorId, action: "lesson.cancelledByStudent", targetType: "lesson", targetId: lesson.id, summary: refunded ? "Cancelled with refund" : "Late cancellation, no refund" });
    return { refunded };
  }));
}

/** Book the same lesson again with the same teacher at a new time. */
export function rebookLesson(actorId: string, lessonId: string, date: string, time: string): ServiceResult<Lesson> {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const original = requireLesson(draft, lessonId);
    assertCan(draft, actor, "lesson.book", { lessonId });
    assertSlotOpen(draft, original.teacherId, date, time);
    const lesson = createLesson(draft, { teacherId: original.teacherId, studentId: original.studentId, date, time, title: original.title, focus: original.focus, actorId });
    changeCredits(draft, { studentId: original.studentId, hours: -LESSON_CREDIT_HOURS, reason: "booking", description: `${original.title} lesson`, actorId, lessonId: lesson.id });
    return lesson;
  }));
}

/**
 * A manager (or the admin) books an open slot for a student on their team. Same rules as a
 * student booking: the slot must be open, the student must have credits, and the lesson gets
 * the next plan from the student's enrollment with that teacher.
 */
export function bookLessonOnBehalf(actorId: string, input: BookLessonInput & { studentId: string }): ServiceResult<Lesson> {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "lesson.bookOnBehalf", { teacherId: input.teacherId, studentId: input.studentId });
    const student = requireUser(draft, input.studentId);
    if (student.role !== "student") throw new ServiceError("Choose a student.");
    if (student.status !== "active") throw new ServiceError(`${student.name} is paused. Reactivate them before booking.`);
    assertSlotOpen(draft, input.teacherId, input.date, input.time);
    const lesson = createLesson(draft, { ...input, actorId });
    changeCredits(draft, { studentId: input.studentId, hours: -LESSON_CREDIT_HOURS, reason: "booking", description: `${input.title} lesson (booked by ${actor.name})`, actorId, lessonId: lesson.id });
    return lesson;
  }));
}
