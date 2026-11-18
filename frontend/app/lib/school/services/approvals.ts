import { assertCan } from "../permissions";
import { slotStartDate } from "../../scheduling";
import { createId, get, patch, query, recordActivity, upsert } from "../repositories";
import { updateSchool } from "../store";
import { isApiDataMode } from "../../auth/mode";
import { recordAbsence, reviewRequest as reviewRequestApi } from "../api/approvals";
import { changeCredits, LESSON_CREDIT_HOURS, requireUser } from "./common";
import { run, runAsync, ServiceError, type ServiceCall } from "./result";

export type ReviewDecision = "approved" | "rejected";

/**
 * A manager (or the admin) decides on a teacher's request. Approving a slot closure closes the
 * slot; approving a cancellation cancels the lesson and refunds the student per school settings.
 */
export function reviewRequest(actorId: string, requestId: string, decision: ReviewDecision, note: string): ServiceCall {
  if (isApiDataMode()) return runAsync(async () => { await reviewRequestApi(requestId, decision, note.trim()); });
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const request = get(draft, "requests", requestId);
    if (!request) throw new ServiceError("That request no longer exists.");
    assertCan(draft, actor, "request.review", { teacherId: request.teacherId });
    if (request.status !== "pending") throw new ServiceError("That request has already been reviewed.");
    // Mirrors the backend: a completed lesson cannot be cancelled, so the request stays pending.
    if (request.type === "lesson-cancellation" && decision === "approved" && get(draft, "lessons", request.lessonId)?.status === "completed") {
      throw new ServiceError("That lesson is already completed and cannot be cancelled.");
    }

    patch(draft, "requests", request.id, { status: decision, reviewedBy: actor.id, reviewedAt: new Date().toISOString(), reviewNote: note.trim() || undefined });

    if (request.type === "lesson-cancellation" && decision === "approved") {
      const lesson = get(draft, "lessons", request.lessonId);
      if (lesson && lesson.status !== "cancelled") {
        patch(draft, "lessons", lesson.id, { status: "cancelled", cancelReason: request.reason });
        if (draft.settings.refundTeacherCancellations) {
          changeCredits(draft, { studentId: lesson.studentId, hours: LESSON_CREDIT_HOURS, reason: "refund", description: "Teacher cancellation refund", actorId, lessonId: lesson.id });
        }
      }
    }
    recordActivity(draft, { actorId, action: `request.${decision}`, targetType: "request", targetId: request.id, summary: `${request.type} ${decision}` });
  }));
}

/**
 * A manager records that the teacher missed a lesson the student attended: -20 performance points
 * (via the absence record), the lesson is cancelled, and the student is refunded per settings.
 */
export function recordTeacherAbsence(actorId: string, lessonId: string, note: string): ServiceCall {
  if (isApiDataMode()) return runAsync(async () => { await recordAbsence(lessonId, note.trim()); });
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const lesson = get(draft, "lessons", lessonId);
    if (!lesson) throw new ServiceError("That lesson no longer exists.");
    assertCan(draft, actor, "absence.record", { lessonId });
    if (slotStartDate(lesson.date, lesson.time).getTime() > Date.now()) throw new ServiceError("You can only record an absence once the lesson has started.");
    if (query(draft, "absences", (absence) => absence.lessonId === lessonId).length) throw new ServiceError("An absence is already recorded for this lesson.");
    const trimmed = note.trim();
    if (trimmed.length < 5) throw new ServiceError("Describe what happened (at least 5 characters).");
    upsert(draft, "absences", { id: createId("absence"), lessonId, teacherId: lesson.teacherId, note: trimmed, reportedBy: actor.id, reportedAt: new Date().toISOString() });
    const wasCancelled = lesson.status === "cancelled";
    patch(draft, "lessons", lesson.id, { status: "cancelled", cancelReason: "Teacher absent; the student was present." });
    if (!wasCancelled && draft.settings.refundTeacherCancellations) {
      changeCredits(draft, { studentId: lesson.studentId, hours: LESSON_CREDIT_HOURS, reason: "refund", description: "Teacher absence refund", actorId, lessonId: lesson.id });
    }
    recordActivity(draft, { actorId, action: "absence.recorded", targetType: "lesson", targetId: lesson.id, summary: trimmed });
  }));
}
