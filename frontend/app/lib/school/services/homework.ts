import { assertCan } from "../permissions";
import { createId, get, patch, recordActivity, upsert } from "../repositories";
import { studentsForUser } from "../selectors";
import { updateSchool } from "../store";
import { isApiDataMode } from "../../auth/mode";
import { assignHomework as assignHomeworkApi, reviewHomework as reviewHomeworkApi, submitHomework as submitHomeworkApi } from "../api/homework";
import type { Assignment, HomeworkType } from "../types";
import { requireUser } from "./common";
import { run, runAsync, ServiceError, type ServiceCall } from "./result";

/** Shared homework: the teacher assigns, the student submits, the teacher reviews. */

export type AssignHomeworkInput = { title: string; type?: HomeworkType; instructions?: string; dueLabel: string };

export function assignHomework(actorId: string, studentId: string, input: AssignHomeworkInput): ServiceCall<Assignment> {
  if (isApiDataMode()) return runAsync(async () => await assignHomeworkApi({ studentId, title: input.title.trim(), type: input.type ?? "writing", description: input.title.trim(), instructions: input.instructions?.trim() || "Complete the task and submit your work before the next lesson.", dueLabel: input.dueLabel.trim() }) as Assignment);
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "homework.assign", { teacherId: actor.id });
    if (!studentsForUser(draft, actor).some((student) => student.id === studentId)) throw new ServiceError("You can only set homework for your own students.");
    const title = input.title.trim();
    if (title.length < 3) throw new ServiceError("Give the homework a title.");
    const assignment: Assignment = {
      id: createId("assignment"),
      studentId,
      teacherId: actor.id,
      title,
      type: input.type ?? "writing",
      description: title,
      instructions: input.instructions?.trim() || "Complete the task and submit your work before the next lesson.",
      dueLabel: input.dueLabel.trim() || "No due date",
      status: "assigned",
      createdAt: new Date().toISOString(),
    };
    upsert(draft, "assignments", assignment);
    recordActivity(draft, { actorId, action: "homework.assigned", targetType: "assignment", targetId: assignment.id, summary: `${title} for ${get(draft, "users", studentId)?.name}` });
    return assignment;
  }));
}

export function submitHomework(actorId: string, assignmentId: string, response: string): ServiceCall {
  if (isApiDataMode()) return runAsync(async () => { await submitHomeworkApi(assignmentId, response); });
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const assignment = get(draft, "assignments", assignmentId);
    if (!assignment) throw new ServiceError("That assignment no longer exists.");
    assertCan(draft, actor, "homework.submit", { studentId: assignment.studentId });
    if (assignment.status === "reviewed") throw new ServiceError("This assignment has already been reviewed.");
    if (!response.trim()) throw new ServiceError("Add your answer before submitting.");
    patch(draft, "assignments", assignmentId, { status: "submitted", response: response.trim(), submittedAt: new Date().toISOString() });
    recordActivity(draft, { actorId, action: "homework.submitted", targetType: "assignment", targetId: assignmentId, summary: assignment.title });
  }));
}

export function reviewHomework(actorId: string, assignmentId: string, input: { feedback?: string; grade?: string }): ServiceCall {
  if (isApiDataMode()) return runAsync(async () => { await reviewHomeworkApi(assignmentId, input); });
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const assignment = get(draft, "assignments", assignmentId);
    if (!assignment) throw new ServiceError("That assignment no longer exists.");
    assertCan(draft, actor, "homework.review", { teacherId: assignment.teacherId });
    if (assignment.status === "reviewed") throw new ServiceError("This assignment has already been reviewed.");
    patch(draft, "assignments", assignmentId, {
      status: "reviewed",
      feedback: input.feedback?.trim() || assignment.feedback,
      grade: input.grade?.trim() || assignment.grade,
      reviewedAt: new Date().toISOString(),
    });
    recordActivity(draft, { actorId, action: "homework.reviewed", targetType: "assignment", targetId: assignmentId, summary: assignment.title });
  }));
}
