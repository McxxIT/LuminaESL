"use client";

import { useCallback } from "react";
import { useSchool } from "../../lib/hooks/useSchool";
import { lessonById, nameOf, pendingRequestsForUser, toTeacherLessonView, type SchoolData, type SchoolUser } from "../../lib/school";
import { reviewRequest, type ReviewDecision, type ServiceCall } from "../../lib/school/services";
import type { TeacherLesson, TeacherSlotClosure } from "../../lib/types";

type PendingCancellation = TeacherLesson & { requestId: string; teacherName: string };

function selectApprovals(data: SchoolData, user: SchoolUser | undefined) {
  if (!user) return { closures: [] as TeacherSlotClosure[], cancellations: [] as PendingCancellation[] };
  const pending = pendingRequestsForUser(data, user);
  const closures: TeacherSlotClosure[] = pending.flatMap((request) => request.type !== "slot-closure" ? [] : [{
    id: request.id,
    date: request.date,
    time: request.time,
    reason: request.reason,
    status: request.status,
    requestedAt: request.requestedAt,
    requestedBy: nameOf(data, request.requestedBy, "Teacher"),
  }]);
  const cancellations: PendingCancellation[] = pending.flatMap((request) => {
    if (request.type !== "lesson-cancellation") return [];
    const lesson = lessonById(data, request.lessonId);
    return lesson ? [{ ...toTeacherLessonView(data, lesson), requestId: request.id, teacherName: nameOf(data, lesson.teacherId, "Teacher") }] : [];
  });
  return { closures, cancellations };
}

/** Pending teacher requests in this user's scope (manager: their teachers; admin: everyone). */
export function useApprovals(user: SchoolUser | undefined) {
  const select = useCallback((data: SchoolData) => selectApprovals(data, user), [user]);
  const { closures, cancellations } = useSchool(select);

  const reviewClosure = useCallback((requestId: string, decision: ReviewDecision, note: string): ServiceCall => (
    user ? reviewRequest(user.id, requestId, decision, note) : { ok: false, error: "Sign in again to review requests." }
  ), [user]);

  const reviewCancellation = useCallback((lessonId: string, decision: ReviewDecision, note: string): ServiceCall => {
    const request = cancellations.find((item) => item.id === lessonId);
    if (!user || !request) return { ok: false, error: "That request is no longer pending." };
    return reviewRequest(user.id, request.requestId, decision, note);
  }, [user, cancellations]);

  return {
    loaded: true,
    closures,
    cancellations,
    pendingCount: closures.length + cancellations.length,
    reviewClosure,
    reviewCancellation,
  };
}
