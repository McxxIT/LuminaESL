import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  courseUnits,
  courses,
  enrollments,
  lessonPlans,
  lessons,
} from "../db/schema";
import type { DbOrTx } from "./db-handle";

export type LessonDefaults = {
  enrollmentId: string | null;
  lessonPlanId: string | null;
  planAttachedBy: string | null;
  planAttachedAt: Date | null;
  roomCode: string;
};

export function generateRoomCode(): string {
  return `ESL-${Math.floor(1000 + Math.random() * 9000)}`;
}

/**
 * Enrichment for a newly booked lesson, mirroring `createLesson` in
 * `frontend/app/lib/school/services/common.ts`: the pair's active enrollment, the
 * plan at `nextPlanIndex` plus upcoming lessons already holding plans, the course
 * owner credited as plan author (actor as fallback), and an `ESL-####` room code.
 */
export async function resolveLessonDefaults(
  db: DbOrTx,
  input: { teacherId: string; studentId: string; actorId: string },
): Promise<LessonDefaults> {
  const roomCode = generateRoomCode();
  const [enrollment] = await db
    .select({
      id: enrollments.id,
      courseId: enrollments.courseId,
      nextPlanIndex: enrollments.nextPlanIndex,
      ownerId: courses.ownerId,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(
      and(
        eq(enrollments.studentId, input.studentId),
        eq(enrollments.teacherId, input.teacherId),
        eq(enrollments.status, "active"),
      ),
    )
    .orderBy(asc(enrollments.startedAt))
    .limit(1);
  if (!enrollment) {
    return {
      enrollmentId: null,
      lessonPlanId: null,
      planAttachedBy: null,
      planAttachedAt: null,
      roomCode,
    };
  }

  const [reservedRow] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(lessons)
    .where(
      and(
        eq(lessons.enrollmentId, enrollment.id),
        inArray(lessons.status, ["scheduled", "live"]),
        isNotNull(lessons.lessonPlanId),
      ),
    );
  const reserved = Number(reservedRow?.value ?? 0);

  const plans = await db
    .select({ id: lessonPlans.id })
    .from(lessonPlans)
    .innerJoin(courseUnits, eq(courseUnits.id, lessonPlans.unitId))
    .where(eq(courseUnits.courseId, enrollment.courseId))
    .orderBy(asc(courseUnits.order), asc(lessonPlans.order));
  const plan = plans[enrollment.nextPlanIndex + reserved];

  return {
    enrollmentId: enrollment.id,
    lessonPlanId: plan?.id ?? null,
    planAttachedBy: plan ? enrollment.ownerId ?? input.actorId : null,
    planAttachedAt: plan ? new Date() : null,
    roomCode,
  };
}
