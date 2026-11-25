import { request } from "../../api/client";
import { refreshSchoolAfterCommand } from "./school";

type Method = "POST" | "PATCH" | "DELETE";

async function command<T>(path: string, method: Method, body?: unknown): Promise<T> {
  const value = await request<T>(path, { method, ...(body === undefined ? {} : { body }) });
  await refreshSchoolAfterCommand();
  return value;
}

export type CourseCommand = {
  title: string;
  level: string;
  summary: string;
  objectives: string[];
};

export const createCourse = (input: CourseCommand) => command("/courses", "POST", input);
export const updateCourse = (id: string, input: Partial<CourseCommand> & { status?: string }) =>
  command(`/courses/${encodeURIComponent(id)}`, "PATCH", input);
export const archiveCourse = (id: string) => command(`/courses/${encodeURIComponent(id)}`, "DELETE");
export const duplicateCourse = (id: string) => command(`/courses/${encodeURIComponent(id)}/duplicate`, "POST");

export const createUnit = (courseId: string, title: string, order?: number) =>
  command(`/courses/${encodeURIComponent(courseId)}/units`, "POST", { title, order });
export const updateUnit = (courseId: string, unitId: string, input: { title?: string; order?: number }) =>
  command(`/courses/${encodeURIComponent(courseId)}/units/${encodeURIComponent(unitId)}`, "PATCH", input);
export const deleteUnit = (courseId: string, unitId: string) =>
  command(`/courses/${encodeURIComponent(courseId)}/units/${encodeURIComponent(unitId)}`, "DELETE");

export type LessonPlanCommand = {
  title: string;
  order?: number;
  focus: string[];
  summary: string;
  sections: { heading: string; items: string[] }[];
  attachmentIds?: string[];
};

export const createLessonPlan = (courseId: string, unitId: string, input: LessonPlanCommand) =>
  command(`/courses/${encodeURIComponent(courseId)}/units/${encodeURIComponent(unitId)}/plans`, "POST", input);
export const updateLessonPlan = (courseId: string, unitId: string, planId: string, input: Partial<LessonPlanCommand>) =>
  command(`/courses/${encodeURIComponent(courseId)}/units/${encodeURIComponent(unitId)}/plans/${encodeURIComponent(planId)}`, "PATCH", input);
export const deleteLessonPlan = (courseId: string, unitId: string, planId: string) =>
  command(`/courses/${encodeURIComponent(courseId)}/units/${encodeURIComponent(unitId)}/plans/${encodeURIComponent(planId)}`, "DELETE");
export const attachLessonPlanFile = (courseId: string, unitId: string, planId: string, file: { id: string; name: string; type: string; size: number; storageKey: string }) =>
  command(`/courses/${encodeURIComponent(courseId)}/units/${encodeURIComponent(unitId)}/plans/${encodeURIComponent(planId)}/attachments`, "POST", file);
export const detachLessonPlanFile = (courseId: string, unitId: string, planId: string, attachmentId: string) =>
  command(`/courses/${encodeURIComponent(courseId)}/units/${encodeURIComponent(unitId)}/plans/${encodeURIComponent(planId)}/attachments/${encodeURIComponent(attachmentId)}`, "DELETE");

export const updateLessonPlanAssignment = (lessonId: string, lessonPlanId: string | null) =>
  command(`/lessons/${encodeURIComponent(lessonId)}`, "PATCH", { lessonPlanId });
