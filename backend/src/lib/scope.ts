import { eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema";
import {
  courses,
  enrollments,
  lessons,
  studentProfiles,
  teacherProfiles,
  users,
} from "../db/schema";
import { forbidden, notFound } from "./errors";
import type { TokenPayload } from "../types/fastify";

export type Db = PostgresJsDatabase<typeof schema>;

/**
 * Teachers whose `managerId` is the manager, plus the students on the manager's
 * roster or enrolled with one of those teachers. Mirrors `teachersForUser` /
 * `studentsForUser` in `frontend/app/lib/school/selectors.ts`.
 */
export async function managerTeam(db: Db, managerId: string) {
  const teacherRows = await db
    .select({ userId: teacherProfiles.userId })
    .from(teacherProfiles)
    .where(eq(teacherProfiles.managerId, managerId));
  const teacherIds = teacherRows.map((row) => row.userId);

  const [rosterRows, enrolledRows] = await Promise.all([
    db
      .select({ studentId: studentProfiles.userId })
      .from(studentProfiles)
      .where(eq(studentProfiles.managerId, managerId)),
    teacherIds.length
      ? db
          .select({ studentId: enrollments.studentId })
          .from(enrollments)
          .where(inArray(enrollments.teacherId, teacherIds))
      : Promise.resolve([] as { studentId: string }[]),
  ]);

  const studentIds = [
    ...new Set([
      ...rosterRows.map((row) => row.studentId),
      ...enrolledRows.map((row) => row.studentId),
    ]),
  ];
  return { teacherIds, studentIds, userIds: [...teacherIds, ...studentIds] };
}

/** Students a teacher is enrolled with or has taught a lesson to. */
export async function teacherStudentIds(db: Db, teacherId: string) {
  const [enrolledRows, lessonRows] = await Promise.all([
    db
      .select({ studentId: enrollments.studentId })
      .from(enrollments)
      .where(eq(enrollments.teacherId, teacherId)),
    db
      .select({ studentId: lessons.studentId })
      .from(lessons)
      .where(eq(lessons.teacherId, teacherId)),
  ]);
  return [
    ...new Set([
      ...enrolledRows.map((row) => row.studentId),
      ...lessonRows.map((row) => row.studentId),
    ]),
  ];
}

/** Teachers a student is enrolled with or has had a lesson with. */
export async function studentTeacherIds(db: Db, studentId: string) {
  const [enrolledRows, lessonRows] = await Promise.all([
    db
      .select({ teacherId: enrollments.teacherId })
      .from(enrollments)
      .where(eq(enrollments.studentId, studentId)),
    db
      .select({ teacherId: lessons.teacherId })
      .from(lessons)
      .where(eq(lessons.studentId, studentId)),
  ]);
  return [
    ...new Set([
      ...enrolledRows.map((row) => row.teacherId),
      ...lessonRows.map((row) => row.teacherId),
    ]),
  ];
}

export async function adminIds(db: Db) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"));
  return rows.map((row) => row.id);
}

/** True when the teacher is on the manager's team. */
export async function managerOwnsTeacher(
  db: Db,
  managerId: string,
  teacherId: string,
) {
  const [profile] = await db
    .select({ managerId: teacherProfiles.managerId })
    .from(teacherProfiles)
    .where(eq(teacherProfiles.userId, teacherId))
    .limit(1);
  return profile?.managerId === managerId;
}

/** A manager can see a student on their roster or enrolled with one of their teachers. */
export async function managerOwnsStudent(
  db: Db,
  managerId: string,
  studentId: string,
) {
  const [profile] = await db
    .select({ managerId: studentProfiles.managerId })
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, studentId))
    .limit(1);
  if (profile?.managerId === managerId) return true;
  const team = await managerTeam(db, managerId);
  return team.studentIds.includes(studentId);
}

/**
 * Course write guard mirroring `canEditCourse` in
 * `frontend/app/lib/school/services/curriculum.ts`: admins edit every course,
 * managers only the courses they own.
 */
export async function assertCourseEditable(
  db: Db,
  actor: TokenPayload,
  courseId: string,
) {
  const [course] = await db
    .select({ ownerId: courses.ownerId })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) throw notFound("Course not found");
  if (actor.role === "admin" || course.ownerId === actor.sub) return;
  throw forbidden(
    "Only the course owner or the school admin can change this course. Duplicate it to make your own version.",
  );
}

/**
 * Detail-read guard shared by the people routes. Admins see everyone; managers see
 * their team; a teacher sees themself and their own students; a student sees themself
 * and their enrolled teachers.
 */
export async function assertCanViewUser(
  db: Db,
  actor: TokenPayload,
  targetId: string,
) {
  if (actor.role === "admin" || actor.sub === targetId) return;
  if (actor.role === "manager") {
    const team = await managerTeam(db, actor.sub);
    if (team.userIds.includes(targetId)) return;
  }
  if (actor.role === "teacher") {
    const students = await teacherStudentIds(db, actor.sub);
    if (students.includes(targetId)) return;
  }
  if (actor.role === "student") {
    const teachers = await studentTeacherIds(db, actor.sub);
    if (teachers.includes(targetId)) return;
  }
  throw forbidden();
}
