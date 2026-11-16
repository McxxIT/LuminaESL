import { get } from "./repositories";
import { managerIdForStudent, managerIdForTeacher } from "./selectors";
import type { SchoolData, SchoolUser } from "./types";

/**
 * The permission matrix from ADMIN_PLAN.md section 5, in code. Services call `assertCan` before
 * every write; screens may call `can` to hide actions the user cannot take.
 */

export type SchoolAction =
  | "manager.manage"
  | "teacher.assignManager"
  | "teacher.create"
  | "teacher.manage"
  | "student.create"
  | "student.manage"
  | "credits.adjust"
  | "credits.purchase"
  | "course.edit"
  | "attachment.upload"
  | "enrollment.manage"
  | "lesson.attachPlan"
  | "lesson.book"
  | "lesson.bookOnBehalf"
  | "lesson.schedule"
  | "slot.open"
  | "request.create"
  | "request.review"
  | "absence.record"
  | "lesson.complete"
  | "lesson.rate"
  | "homework.assign"
  | "homework.review"
  | "homework.submit"
  | "performance.view"
  | "settings.edit";

/** What the action is about. Pass whichever ids apply; `lessonId` resolves teacher and student. */
export type PermissionTarget = {
  teacherId?: string;
  studentId?: string;
  lessonId?: string;
};

export class PermissionError extends Error {
  constructor(public readonly action: SchoolAction, actor: SchoolUser) {
    super(`${actor.name} (${actor.role}) is not allowed to ${action}.`);
    this.name = "PermissionError";
  }
}

function resolve(data: SchoolData, target: PermissionTarget) {
  const lesson = get(data, "lessons", target.lessonId);
  return {
    teacherId: target.teacherId ?? lesson?.teacherId,
    studentId: target.studentId ?? lesson?.studentId,
  };
}

/** Manager scope: the teacher/student belongs to this manager. Every id given must match. */
function managesTarget(data: SchoolData, manager: SchoolUser, teacherId?: string, studentId?: string) {
  if (!teacherId && !studentId) return false;
  if (teacherId && managerIdForTeacher(data, teacherId) !== manager.id) return false;
  if (studentId && managerIdForStudent(data, studentId) !== manager.id) return false;
  return true;
}

export function can(data: SchoolData, actor: SchoolUser | undefined, action: SchoolAction, target: PermissionTarget = {}): boolean {
  if (!actor || actor.status !== "active") return false;
  const { teacherId, studentId } = resolve(data, target);
  const isAdmin = actor.role === "admin";
  const isManager = actor.role === "manager";
  const ownsAsManager = isManager && managesTarget(data, actor, teacherId, studentId);

  switch (action) {
    case "manager.manage":
    case "teacher.assignManager":
    case "settings.edit":
      return isAdmin;

    case "teacher.manage":
    case "student.manage":
    case "credits.adjust":
    case "enrollment.manage":
    case "lesson.attachPlan":
    case "lesson.bookOnBehalf":
    case "request.review":
    case "absence.record":
      return isAdmin || ownsAsManager;

    case "course.edit":
    case "attachment.upload":
    case "teacher.create":
    case "student.create":
      return isAdmin || isManager;

    case "credits.purchase":
      return actor.role === "student" && (!studentId || studentId === actor.id);

    case "lesson.book":
      return actor.role === "student" && (!studentId || studentId === actor.id);

    case "slot.open":
    case "request.create":
    case "lesson.complete":
    case "lesson.schedule":
    case "homework.assign":
    case "homework.review":
      return actor.role === "teacher" && (!teacherId || teacherId === actor.id);

    case "lesson.rate":
    case "homework.submit":
      return actor.role === "student" && (!studentId || studentId === actor.id);

    case "performance.view":
      if (isAdmin) return true;
      if (isManager) return !teacherId || ownsAsManager;
      return actor.role === "teacher" && (!teacherId || teacherId === actor.id);

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function assertCan(data: SchoolData, actor: SchoolUser | undefined, action: SchoolAction, target: PermissionTarget = {}): asserts actor is SchoolUser {
  if (!actor) throw new Error(`No signed-in user for ${action}.`);
  if (!can(data, actor, action, target)) throw new PermissionError(action, actor);
}
