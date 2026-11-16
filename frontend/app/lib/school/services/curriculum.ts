import { assertCan } from "../permissions";
import { createId, get, patch, query, recordActivity, remove, upsert } from "../repositories";
import { plansForCourse } from "../selectors";
import { updateSchool } from "../store";
import type { Course, CourseStatus, LessonPlan, LessonPlanSection, SchoolData, SchoolUser } from "../types";
import { requireUser } from "./common";
import { run, ServiceError, type ServiceResult } from "./result";

/**
 * Curriculum: courses -> units -> 25-minute lesson plans (+ attachments). The admin edits every
 * course; a manager edits the courses they own. Published courses are visible to everyone.
 */

export const DEFAULT_PLAN_SECTIONS: LessonPlanSection[] = [
  { heading: "Warm-up (5 min)", items: [] },
  { heading: "Main task (15 min)", items: [] },
  { heading: "Wrap-up (5 min)", items: [] },
];

export function canEditCourse(actor: SchoolUser | undefined, course: Course | undefined) {
  if (!actor || !course || actor.status !== "active") return false;
  return actor.role === "admin" || (actor.role === "manager" && course.ownerId === actor.id);
}

function requireEditableCourse(draft: SchoolData, actor: SchoolUser, courseId: string): Course {
  assertCan(draft, actor, "course.edit");
  const course = get(draft, "courses", courseId);
  if (!course) throw new ServiceError("That course no longer exists.");
  if (!canEditCourse(actor, course)) throw new ServiceError("Only the course owner or the school admin can change this course. Duplicate it to make your own version.");
  return course;
}

function courseOfUnit(draft: SchoolData, unitId: string) {
  const unit = get(draft, "courseUnits", unitId);
  if (!unit) throw new ServiceError("That unit no longer exists.");
  return unit;
}

function touch(draft: SchoolData, courseId: string) {
  patch(draft, "courses", courseId, { updatedAt: new Date().toISOString() });
}

function cleanTitle(title: string, what = "a title") {
  const trimmed = title.trim();
  if (trimmed.length < 3) throw new ServiceError(`Enter ${what} (at least 3 characters).`);
  return trimmed;
}

export type CourseInput = { title: string; level: string; summary: string; objectives: string[] | string };

function cleanObjectives(value: string[] | string) {
  return (Array.isArray(value) ? value : value.split("\n")).map((item) => item.trim()).filter(Boolean);
}

export function createCourse(actorId: string, input: CourseInput): ServiceResult<Course> {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "course.edit");
    const now = new Date().toISOString();
    const course: Course = { id: createId("course"), title: cleanTitle(input.title), level: input.level.trim() || "All levels", summary: input.summary.trim(), objectives: cleanObjectives(input.objectives), status: "draft", ownerId: actor.id, createdAt: now, updatedAt: now };
    upsert(draft, "courses", course);
    upsert(draft, "courseUnits", { id: createId("unit"), courseId: course.id, order: 1, title: "Unit 1" });
    recordActivity(draft, { actorId, action: "course.created", targetType: "course", targetId: course.id, summary: course.title });
    return course;
  }));
}

export function updateCourse(actorId: string, courseId: string, input: CourseInput): ServiceResult {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    requireEditableCourse(draft, actor, courseId);
    patch(draft, "courses", courseId, { title: cleanTitle(input.title), level: input.level.trim() || "All levels", summary: input.summary.trim(), objectives: cleanObjectives(input.objectives), updatedAt: new Date().toISOString() });
  }));
}

export function setCourseStatus(actorId: string, courseId: string, status: CourseStatus): ServiceResult {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const course = requireEditableCourse(draft, actor, courseId);
    if (status === "published" && plansForCourse(draft, courseId).length === 0) throw new ServiceError("Add at least one lesson plan before publishing.");
    if (status !== "published") {
      const enrolled = query(draft, "enrollments", (enrollment) => enrollment.courseId === courseId && enrollment.status === "active").length;
      if (status === "archived" && enrolled > 0) throw new ServiceError(`${enrolled} student${enrolled === 1 ? " is" : "s are"} enrolled in this course. Move them to another course first.`);
    }
    patch(draft, "courses", courseId, { status, updatedAt: new Date().toISOString() });
    recordActivity(draft, { actorId, action: `course.${status}`, targetType: "course", targetId: courseId, summary: course.title });
  }));
}

/** Copies a course (units, plans, attachment links) as a new draft owned by the actor. */
export function duplicateCourse(actorId: string, courseId: string): ServiceResult<Course> {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "course.edit");
    const source = get(draft, "courses", courseId);
    if (!source) throw new ServiceError("That course no longer exists.");
    const now = new Date().toISOString();
    const copy: Course = { ...source, id: createId("course"), title: `Copy of ${source.title}`, status: "draft", ownerId: actor.id, createdAt: now, updatedAt: now };
    upsert(draft, "courses", copy);
    query(draft, "courseUnits", (unit) => unit.courseId === courseId).forEach((unit) => {
      const unitId = createId("unit");
      upsert(draft, "courseUnits", { ...unit, id: unitId, courseId: copy.id });
      query(draft, "lessonPlans", (plan) => plan.unitId === unit.id).forEach((plan) => upsert(draft, "lessonPlans", { ...plan, id: createId("plan"), unitId, updatedAt: now }));
    });
    recordActivity(draft, { actorId, action: "course.duplicated", targetType: "course", targetId: copy.id, summary: `From ${source.title}` });
    return copy;
  }));
}

// Units -----------------------------------------------------------------------------------

export function addUnit(actorId: string, courseId: string, title: string): ServiceResult {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    requireEditableCourse(draft, actor, courseId);
    const order = Math.max(0, ...query(draft, "courseUnits", (unit) => unit.courseId === courseId).map((unit) => unit.order)) + 1;
    upsert(draft, "courseUnits", { id: createId("unit"), courseId, order, title: cleanTitle(title, "a unit name") });
    touch(draft, courseId);
  }));
}

export function renameUnit(actorId: string, unitId: string, title: string): ServiceResult {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const unit = courseOfUnit(draft, unitId);
    requireEditableCourse(draft, actor, unit.courseId);
    patch(draft, "courseUnits", unitId, { title: cleanTitle(title, "a unit name") });
    touch(draft, unit.courseId);
  }));
}

export function removeUnit(actorId: string, unitId: string): ServiceResult {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const unit = courseOfUnit(draft, unitId);
    requireEditableCourse(draft, actor, unit.courseId);
    if (query(draft, "lessonPlans", (plan) => plan.unitId === unitId).length) throw new ServiceError("Move or delete this unit's lesson plans first.");
    if (query(draft, "courseUnits", (item) => item.courseId === unit.courseId).length <= 1) throw new ServiceError("A course needs at least one unit.");
    remove(draft, "courseUnits", unitId);
    touch(draft, unit.courseId);
  }));
}

/** Swap with the neighbour above (-1) or below (+1), then renumber. */
function reorder<T extends { id: string; order: number }>(items: T[], id: string, direction: -1 | 1) {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sorted.length) return null;
  [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
  return sorted.map((item, position) => ({ ...item, order: position + 1 }));
}

export function moveUnit(actorId: string, unitId: string, direction: -1 | 1): ServiceResult {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const unit = courseOfUnit(draft, unitId);
    requireEditableCourse(draft, actor, unit.courseId);
    reorder(query(draft, "courseUnits", (item) => item.courseId === unit.courseId), unitId, direction)?.forEach((item) => upsert(draft, "courseUnits", item));
    touch(draft, unit.courseId);
  }));
}

// Lesson plans ----------------------------------------------------------------------------

export type LessonPlanInput = { title: string; focus: string[] | string; summary: string; sections: LessonPlanSection[] };

function cleanSections(sections: LessonPlanSection[]) {
  return sections
    .map((section) => ({ heading: section.heading.trim(), items: section.items.map((item) => item.trim()).filter(Boolean) }))
    .filter((section) => section.heading || section.items.length);
}

/** Creates a plan at the end of the unit, or updates an existing plan. */
export function saveLessonPlan(actorId: string, unitId: string, input: LessonPlanInput, planId?: string): ServiceResult<LessonPlan> {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const unit = courseOfUnit(draft, unitId);
    requireEditableCourse(draft, actor, unit.courseId);
    const focus = (Array.isArray(input.focus) ? input.focus : input.focus.split(",")).map((item) => item.trim()).filter(Boolean);
    const now = new Date().toISOString();
    const existing = planId ? get(draft, "lessonPlans", planId) : undefined;
    if (planId && !existing) throw new ServiceError("That lesson plan no longer exists.");
    const order = existing?.order ?? Math.max(0, ...query(draft, "lessonPlans", (plan) => plan.unitId === unitId).map((plan) => plan.order)) + 1;
    const plan: LessonPlan = {
      id: existing?.id ?? createId("plan"),
      unitId,
      order,
      title: cleanTitle(input.title),
      focus,
      summary: input.summary.trim(),
      sections: cleanSections(input.sections),
      attachmentIds: existing?.attachmentIds ?? [],
      updatedAt: now,
    };
    upsert(draft, "lessonPlans", plan);
    touch(draft, unit.courseId);
    return plan;
  }));
}

/** Plans used by lessons cannot be deleted (teachers and students would lose them). */
export function removeLessonPlan(actorId: string, planId: string): ServiceResult {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const plan = get(draft, "lessonPlans", planId);
    if (!plan) throw new ServiceError("That lesson plan no longer exists.");
    const unit = courseOfUnit(draft, plan.unitId);
    requireEditableCourse(draft, actor, unit.courseId);
    const used = query(draft, "lessons", (lesson) => lesson.lessonPlanId === planId).length;
    if (used) throw new ServiceError(`This plan is attached to ${used} lesson${used === 1 ? "" : "s"}. Archive the course instead of deleting it.`);
    remove(draft, "lessonPlans", planId);
    query(draft, "lessonPlans", (item) => item.unitId === plan.unitId).sort((a, b) => a.order - b.order).forEach((item, position) => patch(draft, "lessonPlans", item.id, { order: position + 1 }));
    touch(draft, unit.courseId);
  }));
}

export function moveLessonPlan(actorId: string, planId: string, direction: -1 | 1): ServiceResult {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const plan = get(draft, "lessonPlans", planId);
    if (!plan) throw new ServiceError("That lesson plan no longer exists.");
    const unit = courseOfUnit(draft, plan.unitId);
    requireEditableCourse(draft, actor, unit.courseId);
    reorder(query(draft, "lessonPlans", (item) => item.unitId === plan.unitId), planId, direction)?.forEach((item) => upsert(draft, "lessonPlans", item));
    touch(draft, unit.courseId);
  }));
}

/**
 * Records an uploaded file on a plan. The bytes must already be stored (see `files.ts`
 * `saveLargeFile`) under `storageKey`; this only writes the metadata.
 */
export function attachFileToPlan(actorId: string, planId: string, file: { name: string; type: string; size: number; storageKey: string; id: string }): ServiceResult {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "attachment.upload");
    const plan = get(draft, "lessonPlans", planId);
    if (!plan) throw new ServiceError("That lesson plan no longer exists.");
    requireEditableCourse(draft, actor, courseOfUnit(draft, plan.unitId).courseId);
    upsert(draft, "attachments", { id: file.id, name: file.name, type: file.type, size: file.size, storageKey: file.storageKey, uploadedBy: actor.id, uploadedAt: new Date().toISOString() });
    patch(draft, "lessonPlans", planId, { attachmentIds: [...plan.attachmentIds, file.id], updatedAt: new Date().toISOString() });
  }));
}

export function detachFileFromPlan(actorId: string, planId: string, attachmentId: string): ServiceResult {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const plan = get(draft, "lessonPlans", planId);
    if (!plan) throw new ServiceError("That lesson plan no longer exists.");
    requireEditableCourse(draft, actor, courseOfUnit(draft, plan.unitId).courseId);
    patch(draft, "lessonPlans", planId, { attachmentIds: plan.attachmentIds.filter((id) => id !== attachmentId), updatedAt: new Date().toISOString() });
    // Metadata stays while any other plan (e.g. a duplicated course) still links to the file.
    if (!query(draft, "lessonPlans", (item) => item.attachmentIds.includes(attachmentId)).length) remove(draft, "attachments", attachmentId);
  }));
}

/**
 * A manager changes (or removes) the lesson plan on one upcoming lesson. The teacher and student
 * see the new plan immediately; the plan is credited to the person who attached it.
 */
export function assignPlanToLesson(actorId: string, lessonId: string, planId: string | null): ServiceResult {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const lesson = get(draft, "lessons", lessonId);
    if (!lesson) throw new ServiceError("That lesson no longer exists.");
    assertCan(draft, actor, "lesson.attachPlan", { lessonId });
    if (lesson.status !== "scheduled" && lesson.status !== "live") throw new ServiceError("Only upcoming lessons can get a different plan.");
    if (planId) {
      const plan = get(draft, "lessonPlans", planId);
      const course = plan ? get(draft, "courses", courseOfUnit(draft, plan.unitId).courseId) : undefined;
      if (!plan || !course || course.status === "archived") throw new ServiceError("Choose a plan from an active course.");
    }
    patch(draft, "lessons", lessonId, planId
      ? { lessonPlanId: planId, planAttachedBy: actor.id, planAttachedAt: new Date().toISOString() }
      : { lessonPlanId: undefined, planAttachedBy: undefined, planAttachedAt: undefined });
    recordActivity(draft, { actorId, action: "lesson.planChanged", targetType: "lesson", targetId: lessonId, summary: planId ? `Plan set to ${get(draft, "lessonPlans", planId)?.title}` : "Plan removed" });
  }));
}
