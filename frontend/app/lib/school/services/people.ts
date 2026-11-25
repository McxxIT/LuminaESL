import { todayISO } from "../../student";
import { isApiDataMode } from "../../auth/mode";
import {
  assignTeacherToManager as assignTeacherToManagerApi,
  createStudent as createStudentApi,
  createUser,
  enrollStudent as enrollStudentApi,
  recordCreditAdjustment,
  refreshSchoolAfterCommand,
  setUserStatus,
  updateUser,
  updateStudent as updateStudentApi,
  updateTeacher as updateTeacherApi,
} from "../api/school";
import { assertCan } from "../permissions";
import { createId, get, list, patch, query, recordActivity, upsert } from "../repositories";
import { managerIdForTeacher } from "../selectors";
import { updateSchool } from "../store";
import type { Guardian, SchoolData, SchoolRole, SchoolUser, UserStatus } from "../types";
import { changeCredits, requireUser } from "./common";
import { run, runAsync, ServiceError, type ServiceResult } from "./result";

/** People management: managers (admin only), teachers, students, enrollments, and credits. */

const AVATAR_COLORS = ["indigo", "peach", "lavender", "mint"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2) throw new ServiceError("Enter a full name.");
  return trimmed;
}

/** Normalised, valid, and not used by anyone else. */
function cleanEmail(draft: SchoolData, email: string, ignoreUserId?: string) {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) throw new ServiceError("Enter a valid email address.");
  if (list(draft, "users").some((user) => user.email.toLowerCase() === normalized && user.id !== ignoreUserId)) {
    throw new ServiceError("Someone in the school already uses that email.");
  }
  return normalized;
}

function newUser(draft: SchoolData, role: SchoolRole, name: string, email: string): SchoolUser {
  const users = list(draft, "users");
  const user: SchoolUser = {
    id: createId(role),
    role,
    name: cleanName(name),
    email: cleanEmail(draft, email),
    status: "active",
    avatarColor: AVATAR_COLORS[users.length % AVATAR_COLORS.length],
    createdAt: new Date().toISOString(),
  };
  return upsert(draft, "users", user);
}

function splitList(value: string[] | string | undefined) {
  const items = Array.isArray(value) ? value : (value ?? "").split(",");
  return items.map((item) => item.trim()).filter(Boolean);
}

/** The permission that guards changes to a given person. */
function manageActionFor(user: SchoolUser) {
  if (user.role === "manager") return { action: "manager.manage" as const, target: {} };
  if (user.role === "teacher") return { action: "teacher.manage" as const, target: { teacherId: user.id } };
  if (user.role === "student") return { action: "student.manage" as const, target: { studentId: user.id } };
  throw new ServiceError("The school admin account cannot be changed here.");
}

// Managers --------------------------------------------------------------------------------

export function createManager(actorId: string, input: { name: string; email: string }): ServiceResult<SchoolUser> | Promise<ServiceResult<SchoolUser>> {
  if (isApiDataMode()) {
    return runAsync(async () => {
      const user = await createUser({ name: cleanName(input.name), email: input.email.trim().toLowerCase(), role: "manager" });
      await refreshSchoolAfterCommand();
      return {
        id: user.id,
        role: "manager" as const,
        name: user.name,
        email: user.email,
        status: user.status,
        avatarColor: user.avatarColor ?? AVATAR_COLORS[0],
        createdAt: user.createdAt ?? new Date().toISOString(),
      };
    });
  }
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "manager.manage");
    const manager = newUser(draft, "manager", input.name, input.email);
    recordActivity(draft, { actorId, action: "manager.created", targetType: "user", targetId: manager.id, summary: manager.name });
    return manager;
  }));
}

// Teachers --------------------------------------------------------------------------------

export type TeacherInput = {
  name: string;
  email: string;
  headline: string;
  specializations: string[] | string;
  languages?: string[] | string;
  bio?: string;
  /** Admin only. Managers always create teachers on their own team. */
  managerId?: string | null;
};

export function createTeacher(actorId: string, input: TeacherInput): ServiceResult<SchoolUser> | Promise<ServiceResult<SchoolUser>> {
  if (isApiDataMode()) {
    return runAsync(async () => {
      const user = await createUser({ name: cleanName(input.name), email: input.email.trim().toLowerCase(), role: "teacher", managerId: input.managerId });
      await updateTeacherApi(user.id, input);
      await refreshSchoolAfterCommand();
      return {
        id: user.id,
        role: "teacher" as const,
        name: user.name,
        email: user.email,
        status: user.status,
        avatarColor: user.avatarColor ?? AVATAR_COLORS[0],
        createdAt: user.createdAt ?? new Date().toISOString(),
      };
    });
  }
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "teacher.create");
    const managerId = actor.role === "manager" ? actor.id : input.managerId ?? null;
    if (managerId && get(draft, "users", managerId)?.role !== "manager") throw new ServiceError("Choose a valid manager.");
    const teacher = newUser(draft, "teacher", input.name, input.email);
    upsert(draft, "teacherProfiles", {
      id: teacher.id, userId: teacher.id, managerId,
      headline: input.headline.trim() || "ESL teacher",
      specializations: splitList(input.specializations),
      languages: splitList(input.languages ?? "English"),
      bio: input.bio?.trim() ?? "",
      hireDate: todayISO(),
      weeklyGoalHours: 20,
    });
    recordActivity(draft, { actorId, action: "teacher.created", targetType: "user", targetId: teacher.id, summary: teacher.name });
    return teacher;
  }));
}

export function updateTeacher(actorId: string, teacherId: string, input: Omit<TeacherInput, "managerId">): ServiceResult | Promise<ServiceResult> {
  if (isApiDataMode()) {
    return runAsync(async () => {
      await updateTeacherApi(teacherId, input);
      await refreshSchoolAfterCommand();
    });
  }
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "teacher.manage", { teacherId });
    const teacher = get(draft, "users", teacherId);
    const profile = get(draft, "teacherProfiles", teacherId);
    if (!teacher || teacher.role !== "teacher" || !profile) throw new ServiceError("That teacher no longer exists.");
    patch(draft, "users", teacherId, { name: cleanName(input.name), email: cleanEmail(draft, input.email, teacherId) });
    patch(draft, "teacherProfiles", teacherId, {
      headline: input.headline.trim() || profile.headline,
      specializations: splitList(input.specializations),
      languages: input.languages !== undefined ? splitList(input.languages) : profile.languages,
      bio: input.bio !== undefined ? input.bio.trim() : profile.bio,
    });
    recordActivity(draft, { actorId, action: "teacher.updated", targetType: "user", targetId: teacherId, summary: input.name });
  }));
}

/**
 * Admin moves a teacher to another manager (or unassigns them). Students whose active enrollment
 * is with this teacher move too; pending requests follow automatically (they route by teacher).
 */
export function assignTeacherToManager(actorId: string, teacherId: string, managerId: string | null): ServiceResult<{ studentsMoved: number }> | Promise<ServiceResult<{ studentsMoved: number }>> {
  if (isApiDataMode()) {
    return runAsync(async () => {
      await assignTeacherToManagerApi(teacherId, managerId);
      await refreshSchoolAfterCommand();
      return { studentsMoved: 0 };
    });
  }
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "teacher.assignManager");
    if (!get(draft, "teacherProfiles", teacherId)) throw new ServiceError("That teacher no longer exists.");
    if (managerId && get(draft, "users", managerId)?.role !== "manager") throw new ServiceError("Choose a valid manager.");
    patch(draft, "teacherProfiles", teacherId, { managerId });
    const studentIds = new Set(query(draft, "enrollments", (enrollment) => enrollment.teacherId === teacherId && enrollment.status === "active").map((enrollment) => enrollment.studentId));
    studentIds.forEach((studentId) => patch(draft, "studentProfiles", studentId, { managerId }));
    recordActivity(draft, { actorId, action: "teacher.reassigned", targetType: "user", targetId: teacherId, summary: `Moved to ${get(draft, "users", managerId)?.name ?? "no manager"}` });
    return { studentsMoved: studentIds.size };
  }));
}

// Students --------------------------------------------------------------------------------

export type StudentInput = {
  name: string;
  email: string;
  level: string;
  targetLevel: string;
  goal: string;
  guardian?: Guardian | null;
};

export function createStudent(actorId: string, input: StudentInput & { teacherId?: string; courseId?: string; startingCredits?: number; managerId?: string | null }): ServiceResult<SchoolUser> | Promise<ServiceResult<SchoolUser>> {
  if (isApiDataMode()) {
    return runAsync(async () => {
      if (input.startingCredits && !Number.isInteger(input.startingCredits)) {
        throw new ServiceError("Starting credits must be a whole number in API mode.");
      }
      const user = await createStudentApi(input);
      if (input.teacherId && input.courseId) await enrollStudentApi(user, input.teacherId, input.courseId);
      if (input.startingCredits) await recordCreditAdjustment(user, input.startingCredits, "Starting credits");
      await refreshSchoolAfterCommand();
      return {
        id: user,
        role: "student" as const,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        status: "active",
        avatarColor: AVATAR_COLORS[0],
        createdAt: new Date().toISOString(),
      };
    });
  }
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "student.create");
    // The student belongs to the manager of their teacher; a manager's students are always their own.
    const teacherManager = input.teacherId ? managerIdForTeacher(draft, input.teacherId) : null;
    const managerId = actor.role === "manager" ? actor.id : teacherManager ?? input.managerId ?? null;
    if (actor.role === "manager" && input.teacherId && teacherManager !== actor.id) throw new ServiceError("Choose one of your own teachers.");
    const student = newUser(draft, "student", input.name, input.email);
    upsert(draft, "studentProfiles", { id: student.id, userId: student.id, managerId, level: input.level, targetLevel: input.targetLevel, goal: input.goal.trim(), guardian: cleanGuardian(input.guardian) });
    if (input.teacherId && input.courseId) addEnrollment(draft, student.id, input.teacherId, input.courseId);
    if (input.startingCredits && input.startingCredits > 0) {
      changeCredits(draft, { studentId: student.id, hours: input.startingCredits, reason: "adjustment", description: "Starting credits", actorId });
    }
    recordActivity(draft, { actorId, action: "student.created", targetType: "user", targetId: student.id, summary: student.name });
    return student;
  }));
}

function cleanGuardian(guardian: Guardian | null | undefined): Guardian | undefined {
  if (!guardian || !guardian.name.trim()) return undefined;
  const email = guardian.email.trim().toLowerCase();
  if (email && !EMAIL_PATTERN.test(email)) throw new ServiceError("Enter a valid guardian email, or leave it empty.");
  return { name: guardian.name.trim(), email, phone: guardian.phone?.trim() || undefined, relationship: guardian.relationship?.trim() || undefined };
}

export function updateStudent(actorId: string, studentId: string, input: StudentInput): ServiceResult | Promise<ServiceResult> {
  if (isApiDataMode()) {
    return runAsync(async () => {
      await updateStudentApi(studentId, input);
      await refreshSchoolAfterCommand();
    });
  }
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "student.manage", { studentId });
    const student = get(draft, "users", studentId);
    if (!student || student.role !== "student") throw new ServiceError("That student no longer exists.");
    patch(draft, "users", studentId, { name: cleanName(input.name), email: cleanEmail(draft, input.email, studentId) });
    patch(draft, "studentProfiles", studentId, { level: input.level, targetLevel: input.targetLevel, goal: input.goal.trim(), guardian: cleanGuardian(input.guardian) });
    recordActivity(draft, { actorId, action: "student.updated", targetType: "user", targetId: studentId, summary: input.name });
  }));
}

function addEnrollment(draft: SchoolData, studentId: string, teacherId: string, courseId: string) {
  if (get(draft, "users", teacherId)?.role !== "teacher") throw new ServiceError("Choose a valid teacher.");
  const course = get(draft, "courses", courseId);
  if (!course || course.status !== "published") throw new ServiceError("Choose a published course.");
  query(draft, "enrollments", (enrollment) => enrollment.studentId === studentId && enrollment.status === "active")
    .forEach((enrollment) => patch(draft, "enrollments", enrollment.id, { status: "ended" }));
  // The student follows their teacher's manager.
  patch(draft, "studentProfiles", studentId, { managerId: managerIdForTeacher(draft, teacherId) });
  return upsert(draft, "enrollments", { id: createId("enrollment"), studentId, teacherId, courseId, nextPlanIndex: 0, status: "active", startedAt: new Date().toISOString() });
}

/**
 * Enroll a student with a teacher in a course. Any current enrollment ends. Lessons already
 * booked stay with the teacher they were booked with.
 */
export function enrollStudent(actorId: string, studentId: string, teacherId: string, courseId: string): ServiceResult | Promise<ServiceResult> {
  if (isApiDataMode()) {
    return runAsync(async () => {
      await enrollStudentApi(studentId, teacherId, courseId);
      await refreshSchoolAfterCommand();
    });
  }
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "enrollment.manage", { studentId, teacherId });
    addEnrollment(draft, studentId, teacherId, courseId);
    recordActivity(draft, { actorId, action: "enrollment.created", targetType: "user", targetId: studentId, summary: `With ${get(draft, "users", teacherId)?.name}` });
  }));
}

export function adjustCredits(actorId: string, studentId: string, hours: number, reason: string): ServiceResult | Promise<ServiceResult> {
  if (isApiDataMode()) {
    return runAsync(async () => {
      await recordCreditAdjustment(studentId, hours, reason.trim());
      await refreshSchoolAfterCommand();
    });
  }
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "credits.adjust", { studentId });
    if (!Number.isFinite(hours) || hours === 0) throw new ServiceError("Enter how many hours to add or remove.");
    if (!reason.trim()) throw new ServiceError("Add a reason for the adjustment.");
    changeCredits(draft, { studentId, hours: Number(hours.toFixed(2)), reason: "adjustment", description: reason.trim(), actorId });
    recordActivity(draft, { actorId, action: "credits.adjusted", targetType: "user", targetId: studentId, summary: `${hours > 0 ? "+" : ""}${hours} hrs: ${reason.trim()}` });
  }));
}

// Any person ------------------------------------------------------------------------------

/** Pause or reactivate a manager (admin), teacher, or student. Paused people cannot sign in or act. */
export function setPersonStatus(actorId: string, userId: string, status: Exclude<UserStatus, "archived">): ServiceResult | Promise<ServiceResult> {
  if (isApiDataMode()) {
    return runAsync(async () => {
      await setUserStatus(userId, status);
      await refreshSchoolAfterCommand();
    });
  }
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const person = get(draft, "users", userId);
    if (!person) throw new ServiceError("That person no longer exists.");
    if (person.id === actor.id) throw new ServiceError("You cannot pause your own account.");
    const { action, target } = manageActionFor(person);
    assertCan(draft, actor, action, target);
    patch(draft, "users", userId, { status });
    recordActivity(draft, { actorId, action: `user.${status}`, targetType: "user", targetId: userId, summary: person.name });
  }));
}

export function updateManager(actorId: string, managerId: string, input: { name: string; email: string }): ServiceResult | Promise<ServiceResult> {
  if (isApiDataMode()) {
    return runAsync(async () => {
      await updateUser(managerId, { name: cleanName(input.name), email: input.email });
      await refreshSchoolAfterCommand();
    });
  }
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "manager.manage");
    if (get(draft, "users", managerId)?.role !== "manager") throw new ServiceError("That manager no longer exists.");
    patch(draft, "users", managerId, { name: cleanName(input.name), email: cleanEmail(draft, input.email, managerId) });
  }));
}
