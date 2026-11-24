import { ApiError, request } from "../../api/client";
import { getSessionSnapshot } from "../../auth/session";
import { refreshSchoolFromApi } from "./bootstrap";
import type { Guardian, SchoolRole, SchoolSettings } from "../types";
import type { ApiUser } from "../../api/types";

export type SchoolSettingsCommand = Partial<
  Pick<
    SchoolSettings,
    | "schoolName"
    | "onTheSpotCancellationHours"
    | "performanceWindowDays"
    | "studentLateCancellationHours"
    | "refundTeacherCancellations"
  >
>;

const DEFAULT_ACCOUNT_PASSWORD = "Password123!";

export type UserCommandInput = {
  name: string;
  email: string;
  role: SchoolRole;
  managerId?: string | null;
};

export type TeacherCommandInput = {
  name: string;
  email: string;
  headline: string;
  specializations: string[] | string;
  languages?: string[] | string;
  bio?: string;
  managerId?: string | null;
};

export type StudentCommandInput = {
  name: string;
  email: string;
  level: string;
  targetLevel: string;
  goal: string;
  guardian?: Guardian | null;
  managerId?: string | null;
};

function splitList(value: string[] | string | undefined, fallback = "English"): string[] {
  const items = Array.isArray(value) ? value : (value ?? fallback).split(",");
  return items.map((item) => item.trim()).filter(Boolean);
}

export async function createUser(input: UserCommandInput): Promise<ApiUser> {
  return request("/users", {
    method: "POST",
    body: { ...input, managerId: input.managerId ?? undefined, password: DEFAULT_ACCOUNT_PASSWORD },
  });
}

export async function updateUser(userId: string, input: { name: string; email?: string }): Promise<void> {
  await request(`/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: { name: input.name, ...(input.email ? { email: input.email.trim().toLowerCase() } : {}) },
  });
}

/** Admin-only password reset for another account; ends that account's refresh sessions. */
export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  await request(`/users/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
    body: { newPassword },
  });
}

export async function setUserStatus(userId: string, status: "active" | "paused"): Promise<void> {
  await request(`/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: { status },
  });
}

export async function createTeacher(input: TeacherCommandInput): Promise<string> {
  const user = await createUser({ name: input.name, email: input.email, role: "teacher", managerId: input.managerId });
  const userId = user.id;
  await request(`/teachers/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: {
      headline: input.headline.trim() || "ESL teacher",
      specializations: splitList(input.specializations, ""),
      languages: splitList(input.languages),
      bio: input.bio?.trim() ?? "",
    },
  });
  return userId;
}

export async function updateTeacher(userId: string, input: TeacherCommandInput): Promise<void> {
  await updateUser(userId, input);
  await request(`/teachers/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: {
      headline: input.headline.trim(),
      specializations: splitList(input.specializations, ""),
      languages: splitList(input.languages),
      bio: input.bio?.trim() ?? "",
    },
  });
}

export async function assignTeacherToManager(teacherId: string, managerId: string | null): Promise<void> {
  await request(`/teachers/${encodeURIComponent(teacherId)}`, {
    method: "PATCH",
    body: { managerId },
  });
}

export async function createStudent(input: StudentCommandInput): Promise<string> {
  const user = await createUser({ name: input.name, email: input.email, role: "student", managerId: input.managerId });
  const userId = user.id;
  await updateStudentProfile(userId, input);
  return userId;
}

export async function updateStudent(userId: string, input: StudentCommandInput): Promise<void> {
  await updateUser(userId, input);
  await updateStudentProfile(userId, input);
}

async function updateStudentProfile(userId: string, input: StudentCommandInput): Promise<void> {
  const guardian = input.guardian;
  await request(`/students/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: {
      level: input.level,
      targetLevel: input.targetLevel,
      goal: input.goal.trim(),
      managerId: input.managerId,
      guardianName: guardian?.name?.trim() || null,
      guardianEmail: guardian?.email?.trim().toLowerCase() || null,
      guardianPhone: guardian?.phone?.trim() || null,
      guardianRelationship: guardian?.relationship?.trim() || null,
    },
  });
}

export async function enrollStudent(studentId: string, teacherId: string, courseId: string): Promise<void> {
  await request("/enrollments", {
    method: "POST",
    body: { studentId, teacherId, courseId },
  });
}

export async function recordCreditAdjustment(studentId: string, hours: number, description: string): Promise<void> {
  await request("/credits", {
    method: "POST",
    body: { studentId, hours, reason: "adjustment", description },
  });
}

export async function updateSchoolSettings(input: SchoolSettingsCommand): Promise<void> {
  await request("/settings", { method: "PATCH", body: input });
}

export async function updateMyName(userId: string, name: string): Promise<void> {
  await request(`/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: { name },
  });
}

/** Rehydrate the role-scoped read model after a successful command. */
export async function refreshSchoolAfterCommand(): Promise<void> {
  const email = getSessionSnapshot().user?.email;
  if (!email) {
    throw new ApiError(401, "UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  }
  await refreshSchoolFromApi(email);
}

type CommandMethod = "POST" | "PATCH" | "DELETE";
async function command<T = void>(path: string, method: CommandMethod, body?: unknown): Promise<T> {
  return request<T>(path, { method, ...(body === undefined ? {} : { body }) });
}

export async function createCourseCommand(input: { title: string; level: string; summary: string; objectives: string[] }) {
  return command("/courses", "POST", input);
}
export async function updateCourseCommand(id: string, input: Record<string, unknown>) {
  return command(`/courses/${encodeURIComponent(id)}`, "PATCH", input);
}
export async function deleteCourseCommand(id: string) { return command(`/courses/${encodeURIComponent(id)}`, "DELETE"); }
export async function createUnitCommand(courseId: string, title: string, order?: number) {
  return command(`/courses/${encodeURIComponent(courseId)}/units`, "POST", { title, order });
}
export async function updateUnitCommand(courseId: string, unitId: string, input: Record<string, unknown>) {
  return command(`/courses/${encodeURIComponent(courseId)}/units/${encodeURIComponent(unitId)}`, "PATCH", input);
}
export async function deleteUnitCommand(courseId: string, unitId: string) {
  return command(`/courses/${encodeURIComponent(courseId)}/units/${encodeURIComponent(unitId)}`, "DELETE");
}
export async function createPlanCommand(courseId: string, unitId: string, input: Record<string, unknown>) {
  return command(`/courses/${encodeURIComponent(courseId)}/units/${encodeURIComponent(unitId)}/plans`, "POST", input);
}
export async function updatePlanCommand(courseId: string, unitId: string, planId: string, input: Record<string, unknown>) {
  return command(`/courses/${encodeURIComponent(courseId)}/units/${encodeURIComponent(unitId)}/plans/${encodeURIComponent(planId)}`, "PATCH", input);
}
export async function deletePlanCommand(courseId: string, unitId: string, planId: string) {
  return command(`/courses/${encodeURIComponent(courseId)}/units/${encodeURIComponent(unitId)}/plans/${encodeURIComponent(planId)}`, "DELETE");
}
export async function createCreditCommand(input: { studentId: string; hours: number; reason: "purchase" | "refund" | "adjustment"; description: string; amount?: number }) {
  return command("/credits", "POST", input);
}
export async function bookLessonCommand(input: Record<string, unknown>) { return command("/bookings", "POST", input); }
export async function cancelBookingCommand(id: string, reason: string) { return command(`/bookings/${encodeURIComponent(id)}`, "DELETE", { reason }); }
export async function createRequestCommand(input: Record<string, unknown>) { return command("/requests", "POST", input); }
export async function reviewRequestCommand(id: string, input: Record<string, unknown>) { return command(`/requests/${encodeURIComponent(id)}/review`, "POST", input); }
export async function assignmentCommand(path: string, input: Record<string, unknown>) { return command(path, "POST", input); }
export async function lessonCommand(path: string, method: "POST" | "PATCH", input?: Record<string, unknown>) { return command(path, method, input); }

export async function mutateSchool(path: string, method: CommandMethod, body?: Record<string, unknown>) {
  const result = await command(path, method, body);
  await refreshSchoolAfterCommand();
  return result;
}
