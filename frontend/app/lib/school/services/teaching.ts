import { isSlotInPast } from "../../scheduling";
import { fileStorageKey, saveFile } from "../files";
import { assertCan } from "../permissions";
import { createId, get, patch, query, recordActivity, remove, upsert } from "../repositories";
import { getSchoolSnapshot, updateSchool } from "../store";
import { isApiDataMode } from "../../auth/mode";
import { completeLesson as completeLessonApi, createRequest, uploadDataUrlAttachment, withdrawRequest } from "../api/teaching";
import { openSlot as openSlotApi } from "../api/bookings";
import type { LessonAttendance, LessonCancellationRequest, SlotClosureRequest } from "../types";
import { requireLesson, requireUser } from "./common";
import { run, runAsync, ServiceError, type ServiceCall } from "./result";

/** Teacher actions on their own slots and lessons. */

export function openSlot(actorId: string, date: string, time: string): ServiceCall {
  if (isApiDataMode()) return runAsync(async () => { await openSlotApi(actorId, date, time); });
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "slot.open", { teacherId: actor.id });
    if (isSlotInPast(date, time)) throw new ServiceError("Past slots cannot be opened.");
    // Opening removes any closure record for this slot (pending or approved), as before.
    query(draft, "requests", (request) => request.type === "slot-closure" && request.teacherId === actor.id && request.date === date && request.time === time)
      .forEach((request) => remove(draft, "requests", request.id));
    const exists = query(draft, "slotOpenings", (opening) => opening.teacherId === actor.id && opening.date === date && opening.time === time).length > 0;
    if (!exists) upsert(draft, "slotOpenings", { id: createId("opening"), teacherId: actor.id, date, time, openedAt: new Date().toISOString(), openedBy: actor.id });
    recordActivity(draft, { actorId, action: "slot.opened", targetType: "slot", targetId: `${date} ${time}`, summary: `Opened ${date} ${time}` });
  }));
}

export function requestSlotClosure(actorId: string, date: string, time: string, reason: string): ServiceCall {
  if (isApiDataMode()) return runAsync(async () => { await createRequest({ type: "slot-closure", date, time, reason }); });
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "request.create", { teacherId: actor.id });
    const trimmed = reason.trim();
    if (!trimmed) throw new ServiceError("Add a reason for the closure.");
    query(draft, "requests", (request) => request.type === "slot-closure" && request.teacherId === actor.id && request.date === date && request.time === time)
      .forEach((request) => remove(draft, "requests", request.id));
    const request: SlotClosureRequest = { id: createId("request"), type: "slot-closure", teacherId: actor.id, date, time, reason: trimmed, status: "pending", requestedAt: new Date().toISOString(), requestedBy: actor.id };
    upsert(draft, "requests", request);
    recordActivity(draft, { actorId, action: "request.created", targetType: "request", targetId: request.id, summary: `Slot closure ${date} ${time}` });
  }));
}

export function withdrawSlotClosure(actorId: string, date: string, time: string): ServiceCall {
  if (isApiDataMode()) return runAsync(async () => { const request = Object.values(getSchoolSnapshot().collections.requests).find((item) => item.type === "slot-closure" && item.date === date && item.time === time && item.status === "pending"); if (!request) throw new ServiceError("That closure request is no longer pending."); await withdrawRequest(request.id); });
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "request.create", { teacherId: actor.id });
    query(draft, "requests", (request) => request.type === "slot-closure" && request.status === "pending" && request.teacherId === actor.id && request.date === date && request.time === time)
      .forEach((request) => remove(draft, "requests", request.id));
  }));
}

export type CancellationRequestInput = {
  reason: string;
  comment: string;
  attachment?: { name: string; type: string; dataUrl: string };
};

export function requestLessonCancellation(actorId: string, lessonId: string, input: CancellationRequestInput): ServiceCall {
  if (isApiDataMode()) {
    return runAsync(async () => {
      // Two steps: store the file first, then file the request pointing at it.
      const attachmentId = input.attachment ? await uploadDataUrlAttachment(input.attachment) : undefined;
      await createRequest({ type: "lesson-cancellation", lessonId, reason: input.reason, comment: input.comment, ...(attachmentId ? { attachmentId } : {}) });
    });
  }
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const lesson = requireLesson(draft, lessonId);
    assertCan(draft, actor, "request.create", { lessonId });
    if (lesson.status !== "scheduled") throw new ServiceError("Only scheduled lessons can be cancelled.");
    const reason = input.reason.trim();
    const comment = input.comment.trim();
    if (!reason || !comment) throw new ServiceError("Add a reason and a comment.");
    let attachmentId: string | undefined;
    if (input.attachment) {
      attachmentId = createId("attachment");
      const storageKey = fileStorageKey(attachmentId);
      if (!saveFile(storageKey, input.attachment.dataUrl)) throw new ServiceError("The attachment could not be saved. Try a smaller file.");
      upsert(draft, "attachments", { id: attachmentId, name: input.attachment.name, type: input.attachment.type, size: input.attachment.dataUrl.length, storageKey, uploadedBy: actor.id, uploadedAt: new Date().toISOString() });
    }
    const request: LessonCancellationRequest = { id: createId("request"), type: "lesson-cancellation", lessonId, teacherId: lesson.teacherId, reason, comment, attachmentId, status: "pending", requestedAt: new Date().toISOString(), requestedBy: actor.id };
    upsert(draft, "requests", request);
    recordActivity(draft, { actorId, action: "request.created", targetType: "request", targetId: request.id, summary: `Cancellation of ${lesson.title}` });
  }));
}

export function withdrawLessonCancellation(actorId: string, lessonId: string): ServiceCall {
  if (isApiDataMode()) return runAsync(async () => { const request = Object.values(getSchoolSnapshot().collections.requests).find((item) => item.type === "lesson-cancellation" && item.lessonId === lessonId && item.status === "pending"); if (!request) throw new ServiceError("That cancellation request is no longer pending."); await withdrawRequest(request.id); });
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "request.create", { lessonId });
    query(draft, "requests", (request) => request.type === "lesson-cancellation" && request.lessonId === lessonId && request.status === "pending")
      .forEach((request) => remove(draft, "requests", request.id));
  }));
}

export type CompleteLessonInput = { attendance: LessonAttendance; feedback: string; homework: string };

/** Writes the lesson report once (both teacher and student see it) and advances the course. */
export function completeLesson(actorId: string, lessonId: string, input: CompleteLessonInput): ServiceCall<{ firstCompletion: boolean }> {
  if (isApiDataMode()) return runAsync(async () => await completeLessonApi(lessonId, { attendance: input.attendance, feedback: input.feedback.trim() || undefined, homework: input.homework.trim() || undefined }) as { firstCompletion: boolean });
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const lesson = requireLesson(draft, lessonId);
    assertCan(draft, actor, "lesson.complete", { lessonId });
    if (lesson.status === "cancelled") throw new ServiceError("Cancelled lessons cannot be completed.");
    const firstCompletion = lesson.status !== "completed";
    patch(draft, "lessons", lesson.id, { status: "completed", attendance: input.attendance, feedback: input.feedback.trim() || undefined, homework: input.homework.trim() || undefined });
    const enrollment = get(draft, "enrollments", lesson.enrollmentId);
    if (firstCompletion && enrollment && lesson.lessonPlanId) patch(draft, "enrollments", enrollment.id, { nextPlanIndex: enrollment.nextPlanIndex + 1 });
    recordActivity(draft, { actorId, action: "lesson.completed", targetType: "lesson", targetId: lesson.id, summary: input.attendance === "attended" ? "Completed" : "No-show" });
    return { firstCompletion };
  }));
}
