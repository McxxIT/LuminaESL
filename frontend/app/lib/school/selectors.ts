import { get, list, query } from "./repositories";
import type { Course, Lesson, LessonPlan, LibraryItem, SchoolData, SchoolRequest, SchoolRole, SchoolUser, StudentProfileRecord, TeacherProfileRecord } from "./types";

/**
 * Read-only, scoped queries shared by every role. Screens use these through `useSchool`; services
 * use them inside transactions. Keep them pure: data in, plain values out.
 */

export function findUserByEmail(data: SchoolData, email: string | null | undefined): SchoolUser | undefined {
  if (!email) return undefined;
  const normalized = email.trim().toLowerCase();
  return list(data, "users").find((user) => user.email.toLowerCase() === normalized);
}

export function usersByRole(data: SchoolData, role: SchoolRole): SchoolUser[] {
  return query(data, "users", (user) => user.role === role).sort((a, b) => a.name.localeCompare(b.name));
}

export function teacherProfile(data: SchoolData, teacherId: string): TeacherProfileRecord | undefined {
  return get(data, "teacherProfiles", teacherId);
}

export function studentProfile(data: SchoolData, studentId: string): StudentProfileRecord | undefined {
  return get(data, "studentProfiles", studentId);
}

export function managerIdForTeacher(data: SchoolData, teacherId: string): string | null {
  return teacherProfile(data, teacherId)?.managerId ?? null;
}

export function managerIdForStudent(data: SchoolData, studentId: string): string | null {
  return studentProfile(data, studentId)?.managerId ?? null;
}

/** Teachers a manager is responsible for. The admin gets every teacher. */
export function teachersForUser(data: SchoolData, user: SchoolUser): SchoolUser[] {
  const teachers = usersByRole(data, "teacher");
  if (user.role === "admin") return teachers;
  if (user.role === "manager") return teachers.filter((teacher) => managerIdForTeacher(data, teacher.id) === user.id);
  if (user.role === "teacher") return teachers.filter((teacher) => teacher.id === user.id);
  return [];
}

/** Students a user can see: admin all, manager their own, teacher those they teach, student themself. */
export function studentsForUser(data: SchoolData, user: SchoolUser): SchoolUser[] {
  const students = usersByRole(data, "student");
  if (user.role === "admin") return students;
  if (user.role === "manager") return students.filter((student) => managerIdForStudent(data, student.id) === user.id);
  if (user.role === "teacher") {
    const taught = new Set([
      ...query(data, "enrollments", (enrollment) => enrollment.teacherId === user.id).map((enrollment) => enrollment.studentId),
      ...query(data, "lessons", (lesson) => lesson.teacherId === user.id).map((lesson) => lesson.studentId),
    ]);
    return students.filter((student) => taught.has(student.id));
  }
  return students.filter((student) => student.id === user.id);
}

function sortLessons(lessons: Lesson[]) {
  return lessons.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export function lessonsForTeacher(data: SchoolData, teacherId: string): Lesson[] {
  return sortLessons(query(data, "lessons", (lesson) => lesson.teacherId === teacherId));
}

export function lessonsForStudent(data: SchoolData, studentId: string): Lesson[] {
  return sortLessons(query(data, "lessons", (lesson) => lesson.studentId === studentId));
}

/** Lessons in a user's scope (manager: their teachers' lessons; admin: all). */
export function lessonsForUser(data: SchoolData, user: SchoolUser): Lesson[] {
  if (user.role === "admin") return sortLessons(list(data, "lessons"));
  if (user.role === "teacher") return lessonsForTeacher(data, user.id);
  if (user.role === "student") return lessonsForStudent(data, user.id);
  const teacherIds = new Set(teachersForUser(data, user).map((teacher) => teacher.id));
  return sortLessons(query(data, "lessons", (lesson) => teacherIds.has(lesson.teacherId)));
}

/** Approval queue: pending requests from teachers this user manages (admin sees every one). */
export function pendingRequestsForUser(data: SchoolData, user: SchoolUser): SchoolRequest[] {
  if (user.role !== "admin" && user.role !== "manager") return [];
  const teacherIds = new Set(teachersForUser(data, user).map((teacher) => teacher.id));
  return query(data, "requests", (request) => request.status === "pending" && teacherIds.has(request.teacherId))
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

export function requestsForTeacher(data: SchoolData, teacherId: string): SchoolRequest[] {
  return query(data, "requests", (request) => request.teacherId === teacherId);
}

export function creditBalance(data: SchoolData, studentId: string): number {
  const total = query(data, "credits", (entry) => entry.studentId === studentId).reduce((sum, entry) => sum + entry.hours, 0);
  return Number(total.toFixed(2));
}

export function ratingsForTeacher(data: SchoolData, teacherId: string) {
  return query(data, "ratings", (rating) => rating.teacherId === teacherId);
}

export function absencesForTeacher(data: SchoolData, teacherId: string) {
  return query(data, "absences", (absence) => absence.teacherId === teacherId);
}

export function publishedCourses(data: SchoolData): Course[] {
  return query(data, "courses", (course) => course.status === "published").sort((a, b) => a.title.localeCompare(b.title));
}

/** All lesson plans of a course in teaching order (unit order, then plan order). */
export function plansForCourse(data: SchoolData, courseId: string): LessonPlan[] {
  const units = query(data, "courseUnits", (unit) => unit.courseId === courseId).sort((a, b) => a.order - b.order);
  return units.flatMap((unit) => query(data, "lessonPlans", (plan) => plan.unitId === unit.id).sort((a, b) => a.order - b.order));
}

export function lessonPlanForLesson(data: SchoolData, lesson: Lesson): LessonPlan | undefined {
  return get(data, "lessonPlans", lesson.lessonPlanId);
}

export function enrollmentsForStudent(data: SchoolData, studentId: string) {
  return query(data, "enrollments", (enrollment) => enrollment.studentId === studentId)
    .sort((a, b) => (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1));
}

export function courseById(data: SchoolData, courseId: string | null | undefined): Course | undefined {
  return get(data, "courses", courseId);
}

export function lessonById(data: SchoolData, lessonId: string | null | undefined): Lesson | undefined {
  return get(data, "lessons", lessonId);
}

/** Courses a user can see: admin all; manager published courses plus their own drafts/archived; others published only. */
export function coursesForUser(data: SchoolData, user: SchoolUser): Course[] {
  return list(data, "courses")
    .filter((course) => user.role === "admin" || course.status === "published" || course.ownerId === user.id)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function unitsForCourse(data: SchoolData, courseId: string) {
  return query(data, "courseUnits", (unit) => unit.courseId === courseId).sort((a, b) => a.order - b.order);
}

export function plansForUnit(data: SchoolData, unitId: string): LessonPlan[] {
  return query(data, "lessonPlans", (plan) => plan.unitId === unitId).sort((a, b) => a.order - b.order);
}

export function attachmentsForPlan(data: SchoolData, plan: LessonPlan) {
  return plan.attachmentIds.flatMap((id) => {
    const file = get(data, "attachments", id);
    return file ? [file] : [];
  });
}

export function activeEnrollmentCount(data: SchoolData, courseId: string) {
  return query(data, "enrollments", (enrollment) => enrollment.courseId === courseId && enrollment.status === "active").length;
}

/** How many lessons use each plan, so the editor can warn before deleting. */
export function lessonCountForPlan(data: SchoolData, planId: string) {
  return query(data, "lessons", (lesson) => lesson.lessonPlanId === planId).length;
}

export type CourseProgress = {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  teacherId: string;
  /** Plans already taught (capped at the course length). */
  completed: number;
  total: number;
  nextPlan?: LessonPlan;
};

/** Where an enrollment is in its course: "plan `completed + 1` of `total`". */
export function enrollmentProgress(data: SchoolData, enrollmentId: string | undefined): CourseProgress | undefined {
  const enrollment = get(data, "enrollments", enrollmentId);
  if (!enrollment) return undefined;
  const plans = plansForCourse(data, enrollment.courseId);
  return {
    enrollmentId: enrollment.id,
    courseId: enrollment.courseId,
    courseTitle: get(data, "courses", enrollment.courseId)?.title ?? "Course",
    teacherId: enrollment.teacherId,
    completed: Math.min(enrollment.nextPlanIndex, plans.length),
    total: plans.length,
    nextPlan: plans[enrollment.nextPlanIndex],
  };
}

export function activeCourseProgress(data: SchoolData, studentId: string): CourseProgress | undefined {
  const active = query(data, "enrollments", (enrollment) => enrollment.studentId === studentId && enrollment.status === "active")[0];
  return enrollmentProgress(data, active?.id);
}

/** Plans a manager can attach to a lesson: every non-archived course they can see, grouped by course. */
export function attachablePlans(data: SchoolData, user: SchoolUser) {
  return coursesForUser(data, user)
    .filter((course) => course.status !== "archived")
    .map((course) => ({ course, plans: plansForCourse(data, course.id) }))
    .filter((group) => group.plans.length > 0);
}

export function ratingsForLesson(data: SchoolData, lessonId: string) {
  return query(data, "ratings", (rating) => rating.lessonId === lessonId);
}

/** Newest activity first (admin activity log). */
export function recentActivity(data: SchoolData, limit = 200) {
  return list(data, "activity").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export function assignmentsForStudent(data: SchoolData, studentId: string) {
  return query(data, "assignments", (assignment) => assignment.studentId === studentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function assignmentsForTeacher(data: SchoolData, teacherId: string) {
  return query(data, "assignments", (assignment) => assignment.teacherId === teacherId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type LibraryFilters = {
  search?: string;
  category?: string;
  includeArchived?: boolean;
};

/** Library items for the browse screen, newest first. Archived items only on request. */
export function libraryItemsFor(data: SchoolData, filters: LibraryFilters = {}): LibraryItem[] {
  const search = filters.search?.trim().toLowerCase() ?? "";
  return list(data, "libraryItems")
    .filter((item) => filters.includeArchived || item.status === "published")
    .filter((item) => !filters.category || item.category === filters.category)
    .filter((item) => !search || [item.title, item.category, item.level ?? "", item.description ?? "", ...item.tags].some((value) => value.toLowerCase().includes(search)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Distinct library categories, sorted, for the category filter. */
export function libraryCategories(data: SchoolData): string[] {
  return [...new Set(list(data, "libraryItems").map((item) => item.category))].sort((a, b) => a.localeCompare(b));
}

/** Library items linked to a lesson, in the order they were attached. */
export function libraryForLesson(data: SchoolData, lessonId: string): LibraryItem[] {
  return query(data, "lessonLibraryItems", (link) => link.lessonId === lessonId)
    .sort((a, b) => a.attachedAt.localeCompare(b.attachedAt))
    .flatMap((link) => {
      const item = get(data, "libraryItems", link.libraryItemId);
      return item ? [item] : [];
    });
}
