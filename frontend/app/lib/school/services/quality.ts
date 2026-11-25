import { assertCan } from "../permissions";
import { isApiDataMode } from "../../auth/mode";
import { refreshSchoolAfterCommand, updateSchoolSettings as updateSchoolSettingsApi } from "../api/school";
import { rateLesson as rateLessonApi } from "../api/teaching";
import { createId, get, query, recordActivity, upsert } from "../repositories";
import { updateSchool } from "../store";
import type { RatingScore, RatingSource, SchoolSettings } from "../types";
import { requireLesson, requireUser } from "./common";
import { run, runAsync, ServiceError, type ServiceCall, type ServiceResult } from "./result";

/** Quality: student/parent ratings and the admin's school-wide rules. */

export type RateLessonInput = { from: RatingSource; score: number; comment?: string };

/**
 * A student rates a completed lesson, as themself or on behalf of their parent/guardian.
 * One rating per lesson per source; it feeds the teacher's performance score immediately.
 */
export function rateLesson(actorId: string, lessonId: string, input: RateLessonInput): ServiceCall {
  if (isApiDataMode()) {
    return runAsync(async () => {
      if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) throw new ServiceError("Choose between 1 and 5 stars.");
      await rateLessonApi(lessonId, { score: input.score, from: input.from, ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}) });
    });
  }
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const lesson = requireLesson(draft, lessonId);
    assertCan(draft, actor, "lesson.rate", { lessonId });
    if (lesson.status !== "completed") throw new ServiceError("You can rate a lesson once it is completed.");
    if (lesson.attendance === "no-show") throw new ServiceError("Lessons you missed cannot be rated.");
    if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) throw new ServiceError("Choose between 1 and 5 stars.");
    if (query(draft, "ratings", (rating) => rating.lessonId === lessonId && rating.from === input.from).length) {
      throw new ServiceError(input.from === "parent" ? "A parent rating already exists for this lesson." : "You already rated this lesson.");
    }
    const guardian = get(draft, "studentProfiles", actor.id)?.guardian;
    const authorName = input.from === "parent" ? guardian?.name ?? `Parent of ${actor.name.split(" ")[0]}` : actor.name;
    upsert(draft, "ratings", {
      id: createId("rating"),
      lessonId,
      teacherId: lesson.teacherId,
      studentId: lesson.studentId,
      from: input.from,
      authorId: input.from === "student" ? actor.id : undefined,
      authorName,
      score: input.score as RatingScore,
      comment: input.comment?.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    recordActivity(draft, { actorId, action: "lesson.rated", targetType: "lesson", targetId: lessonId, summary: `${input.score}★ (${input.from})` });
  }));
}

export type SchoolSettingsInput = Partial<Pick<SchoolSettings, "schoolName" | "onTheSpotCancellationHours" | "performanceWindowDays" | "studentLateCancellationHours" | "refundTeacherCancellations">>;

function inRange(value: number | undefined, min: number, max: number, label: string) {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < min || value > max) throw new ServiceError(`${label} must be between ${min} and ${max}.`);
}

/** Admin-only. Changes apply everywhere immediately (scores, warnings, refunds). */
export function updateSchoolSettings(actorId: string, input: SchoolSettingsInput): ServiceResult | Promise<ServiceResult> {
  if (isApiDataMode()) {
    return runAsync(async () => {
      await updateSchoolSettingsApi(input);
      await refreshSchoolAfterCommand();
    });
  }
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "settings.edit");
    inRange(input.onTheSpotCancellationHours, 0, 72, "The on-the-spot window");
    inRange(input.performanceWindowDays, 7, 180, "The performance window");
    inRange(input.studentLateCancellationHours, 0, 72, "The student cancellation window");
    if (input.schoolName !== undefined && input.schoolName.trim().length < 2) throw new ServiceError("Enter a school name.");
    const before = draft.settings;
    draft.settings = { ...before, ...input, schoolName: input.schoolName?.trim() ?? before.schoolName };
    const changes = (Object.keys(input) as (keyof SchoolSettingsInput)[])
      .filter((key) => before[key] !== draft.settings[key])
      .map((key) => `${key}: ${String(before[key])} → ${String(draft.settings[key])}`);
    if (changes.length) recordActivity(draft, { actorId, action: "settings.updated", targetType: "school", targetId: "settings", summary: changes.join("; ") });
  }));
}
