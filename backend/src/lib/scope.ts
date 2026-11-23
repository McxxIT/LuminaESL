import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema";
import {
  courses,
  courseUnits,
  enrollments,
  lessonPlans,
  lessons,
  requests,
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

/**
 * Per-record attachment read/download authorization mirroring `GET /school/bootstrap`
 * visibility plus uploader self-access during the pre-attach window:
 * - admins: all attachments
 * - uploader (`uploadedBy === actor.sub`): always allowed
 * - request evidence (`requests.attachmentId`): target/requesting teacher or their manager
 * - lesson-plan files (`lesson_plans.attachmentIds`):
 *   - manager: published course, owned course, or plan attached to a team teacher's lesson
 *   - teacher: enrolled in the course or teaching a lesson with that plan
 *   - student: enrolled in the course or taking a lesson with that plan
 */
export async function canAccessAttachment(
  db: Db,
  actor: TokenPayload,
  attachment: { id: string; uploadedBy: string },
): Promise<boolean> {
  if (actor.role === "admin" || attachment.uploadedBy === actor.sub) {
    return true;
  }

  let cachedManagerTeam: Awaited<ReturnType<typeof managerTeam>> | null = null;
  const getTeam = async () => {
    if (!cachedManagerTeam) {
      cachedManagerTeam = await managerTeam(db, actor.sub);
    }
    return cachedManagerTeam;
  };

  // 1. Check cancellation-request evidence links (never visible to students).
  if (actor.role === "manager" || actor.role === "teacher") {
    const reqRows = await db
      .select({
        teacherId: requests.teacherId,
        requestedBy: requests.requestedBy,
      })
      .from(requests)
      .where(eq(requests.attachmentId, attachment.id));

    if (reqRows.length > 0) {
      if (
        actor.role === "teacher" &&
        reqRows.some(
          (row) => row.teacherId === actor.sub || row.requestedBy === actor.sub,
        )
      ) {
        return true;
      }
      if (actor.role === "manager") {
        const team = await getTeam();
        if (reqRows.some((row) => team.teacherIds.includes(row.teacherId))) {
          return true;
        }
      }
    }
  }

  // 2. Check lesson-plan attachment links.
  const planRows = await db
    .select({
      planId: lessonPlans.id,
      courseId: courses.id,
      courseStatus: courses.status,
      courseOwnerId: courses.ownerId,
    })
    .from(lessonPlans)
    .innerJoin(courseUnits, eq(courseUnits.id, lessonPlans.unitId))
    .innerJoin(courses, eq(courses.id, courseUnits.courseId))
    .where(sql`${attachment.id}::uuid = ANY(${lessonPlans.attachmentIds})`);

  if (planRows.length === 0) {
    return false;
  }

  const planIds = planRows.map((row) => row.planId);
  const courseIds = [...new Set(planRows.map((row) => row.courseId))];

  if (actor.role === "manager") {
    if (
      planRows.some(
        (row) =>
          row.courseStatus === "published" || row.courseOwnerId === actor.sub,
      )
    ) {
      return true;
    }
    const team = await getTeam();
    if (team.teacherIds.length > 0) {
      const [teamLesson] = await db
        .select({ id: lessons.id })
        .from(lessons)
        .where(
          and(
            inArray(lessons.teacherId, team.teacherIds),
            inArray(lessons.lessonPlanId, planIds),
          ),
        )
        .limit(1);
      if (teamLesson) return true;
    }
    return false;
  }

  if (actor.role === "teacher") {
    const [enrollmentMatch, lessonMatch] = await Promise.all([
      db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.teacherId, actor.sub),
            inArray(enrollments.courseId, courseIds),
          ),
        )
        .limit(1),
      db
        .select({ id: lessons.id })
        .from(lessons)
        .where(
          and(
            eq(lessons.teacherId, actor.sub),
            inArray(lessons.lessonPlanId, planIds),
          ),
        )
        .limit(1),
    ]);
    return Boolean(enrollmentMatch[0] || lessonMatch[0]);
  }

  if (actor.role === "student") {
    const [enrollmentMatch, lessonMatch] = await Promise.all([
      db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.studentId, actor.sub),
            inArray(enrollments.courseId, courseIds),
          ),
        )
        .limit(1),
      db
        .select({ id: lessons.id })
        .from(lessons)
        .where(
          and(
            eq(lessons.studentId, actor.sub),
            inArray(lessons.lessonPlanId, planIds),
          ),
        )
        .limit(1),
    ]);
    return Boolean(enrollmentMatch[0] || lessonMatch[0]);
  }

  return false;
}

export async function assertCanAccessAttachment(
  db: Db,
  actor: TokenPayload,
  attachment: { id: string; uploadedBy: string },
): Promise<void> {
  if (!(await canAccessAttachment(db, actor, attachment))) {
    throw forbidden("You do not have access to this attachment");
  }
}
