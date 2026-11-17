import type { FastifyPluginAsync } from "fastify";
import {
  absences,
  activity,
  assignments,
  attachments,
  courseUnits,
  courses,
  creditEntries,
  enrollments,
  lessonPlans,
  lessons,
  ratings,
  requests,
  settings,
  slotOpenings,
  studentProfiles,
  teacherProfiles,
  users,
} from "../db/schema";
import { adminIds } from "../lib/scope";

/** Mirrors `SCHOOL_SCHEMA_VERSION` in `frontend/app/lib/school/types.ts`. */
export const SCHOOL_SCHEMA_VERSION = 2;

/** The response keys, checked against `SchoolCollections` in `tests/contract.test.ts`. */
export const BOOTSTRAP_COLLECTION_KEYS = [
  "users",
  "teacherProfiles",
  "studentProfiles",
  "courses",
  "courseUnits",
  "lessonPlans",
  "attachments",
  "enrollments",
  "lessons",
  "slotOpenings",
  "requests",
  "absences",
  "ratings",
  "assignments",
  "credits",
  "activity",
] as const;

/** Settings keys, checked against `SchoolSettings` in `tests/contract.test.ts`. */
export const BOOTSTRAP_SETTINGS_KEYS = [
  "schoolName",
  "onTheSpotCancellationHours",
  "performanceWindowDays",
  "bookingDayStart",
  "bookingDayEnd",
  "studentLateCancellationHours",
  "refundTeacherCancellations",
] as const;

const iso = (value: Date | null | undefined) =>
  value ? value.toISOString() : undefined;

function toRecord<T extends { id: string }>(rows: T[]): Record<string, T> {
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

export const schoolRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/bootstrap",
    { preHandler: app.authenticate },
    async (request) => {
      const actor = request.user;

      const [
        userRows,
        teacherProfileRows,
        studentProfileRows,
        courseRows,
        unitRows,
        planRows,
        attachmentRows,
        enrollmentRows,
        lessonRows,
        slotRows,
        requestRows,
        absenceRows,
        ratingRows,
        assignmentRows,
        creditRows,
        activityRows,
        settingsRows,
        adminRows,
      ] = await Promise.all([
        app.db.select().from(users),
        app.db.select().from(teacherProfiles),
        app.db.select().from(studentProfiles),
        app.db.select().from(courses),
        app.db.select().from(courseUnits),
        app.db.select().from(lessonPlans),
        app.db.select().from(attachments),
        app.db.select().from(enrollments),
        app.db.select().from(lessons),
        app.db.select().from(slotOpenings),
        app.db.select().from(requests),
        app.db.select().from(absences),
        app.db.select().from(ratings),
        app.db.select().from(assignments),
        app.db.select().from(creditEntries),
        app.db.select().from(activity),
        app.db.select().from(settings),
        adminIds(app.db),
      ]);

      const adminIdSet = new Set(adminRows);
      const profileByUser = new Map(
        teacherProfileRows.map((profile) => [profile.userId, profile]),
      );

      const teacherIds = new Set<string>();
      const studentIds = new Set<string>();
      let visibleCourses = courseRows;
      const isAdmin = actor.role === "admin";

      if (isAdmin) {
        teacherProfileRows.forEach((row) => teacherIds.add(row.userId));
        studentProfileRows.forEach((row) => studentIds.add(row.userId));
      } else if (actor.role === "manager") {
        teacherProfileRows
          .filter((row) => row.managerId === actor.sub)
          .forEach((row) => teacherIds.add(row.userId));
        studentProfileRows
          .filter((row) => row.managerId === actor.sub)
          .forEach((row) => studentIds.add(row.userId));
        enrollmentRows
          .filter((row) => teacherIds.has(row.teacherId))
          .forEach((row) => studentIds.add(row.studentId));
        visibleCourses = courseRows.filter(
          (row) => row.status === "published" || row.ownerId === actor.sub,
        );
      } else if (actor.role === "teacher") {
        teacherIds.add(actor.sub);
        enrollmentRows
          .filter((row) => row.teacherId === actor.sub)
          .forEach((row) => studentIds.add(row.studentId));
        const courseIds = new Set(
          enrollmentRows
            .filter((row) => row.teacherId === actor.sub)
            .map((row) => row.courseId),
        );
        visibleCourses = courseRows.filter((row) => courseIds.has(row.id));
      } else {
        studentIds.add(actor.sub);
        const ownEnrollments = enrollmentRows.filter(
          (row) => row.studentId === actor.sub,
        );
        ownEnrollments.forEach((row) => teacherIds.add(row.teacherId));
        lessonRows
          .filter((row) => row.studentId === actor.sub && row.teacherId)
          .forEach((row) => teacherIds.add(row.teacherId));
        const courseIds = new Set(ownEnrollments.map((row) => row.courseId));
        visibleCourses = courseRows.filter((row) => courseIds.has(row.id));
      }

      if (!isAdmin) {
        // Managers also see students who report to them but are not yet enrolled.
        if (actor.role === "manager") {
          studentProfileRows
            .filter((row) => row.managerId === actor.sub)
            .forEach((row) => studentIds.add(row.userId));
        }
      }

      const visibleCourseIds = new Set(visibleCourses.map((row) => row.id));

      const visibleEnrollments = enrollmentRows.filter((row) =>
        isAdmin
          ? true
          : actor.role === "manager"
            ? teacherIds.has(row.teacherId) || studentIds.has(row.studentId)
            : actor.role === "teacher"
              ? row.teacherId === actor.sub
              : row.studentId === actor.sub,
      );

      const visibleLessons = lessonRows.filter((row) =>
        isAdmin
          ? true
          : actor.role === "manager"
            ? teacherIds.has(row.teacherId)
            : actor.role === "teacher"
              ? row.teacherId === actor.sub
              : row.studentId === actor.sub,
      );
      const visibleLessonIds = new Set(visibleLessons.map((row) => row.id));

      // Lessons can carry a plan from a course outside the role's enrollment courses.
      if (!isAdmin) {
        const planById = new Map(planRows.map((row) => [row.id, row]));
        const unitById = new Map(unitRows.map((row) => [row.id, row]));
        for (const lesson of visibleLessons) {
          if (!lesson.lessonPlanId) continue;
          const plan = planById.get(lesson.lessonPlanId);
          const unit = plan ? unitById.get(plan.unitId) : undefined;
          if (unit) visibleCourseIds.add(unit.courseId);
        }
        visibleCourses = courseRows.filter((row) =>
          visibleCourseIds.has(row.id),
        );
      }

      const visibleUnits = unitRows.filter((row) =>
        visibleCourseIds.has(row.courseId),
      );
      const visibleUnitIds = new Set(visibleUnits.map((row) => row.id));
      const visiblePlans = planRows.filter((row) =>
        visibleUnitIds.has(row.unitId),
      );
      const visiblePlanIds = new Set(visiblePlans.map((row) => row.id));

      const visibleSlots = slotRows.filter((row) =>
        isAdmin
          ? true
          : actor.role === "manager"
            ? teacherIds.has(row.teacherId)
            : actor.role === "teacher"
              ? row.teacherId === actor.sub
              : teacherIds.has(row.teacherId),
      );

      const visibleRequests = requestRows.filter((row) =>
        isAdmin
          ? true
          : actor.role === "manager"
            ? teacherIds.has(row.teacherId)
            : actor.role === "teacher"
              ? row.teacherId === actor.sub
              : false,
      );

      const visibleAbsences = absenceRows.filter((row) =>
        isAdmin
          ? true
          : actor.role === "manager"
            ? teacherIds.has(row.teacherId)
            : actor.role === "teacher"
              ? row.teacherId === actor.sub
              : visibleLessonIds.has(row.lessonId),
      );

      const visibleRatings = ratingRows.filter((row) =>
        isAdmin
          ? true
          : actor.role === "manager"
            ? teacherIds.has(row.teacherId)
            : actor.role === "teacher"
              ? row.teacherId === actor.sub
              : row.studentId === actor.sub,
      );

      const visibleAssignments = assignmentRows.filter((row) =>
        isAdmin
          ? true
          : actor.role === "manager"
            ? teacherIds.has(row.teacherId) || studentIds.has(row.studentId)
            : actor.role === "teacher"
              ? row.teacherId === actor.sub
              : row.studentId === actor.sub,
      );

      const visibleCredits = creditRows.filter((row) =>
        isAdmin
          ? true
          : actor.role === "manager"
            ? studentIds.has(row.studentId)
            : actor.role === "teacher"
              ? studentIds.has(row.studentId)
              : row.studentId === actor.sub,
      );

      const visibleActivity = isAdmin ? activityRows : [];

      // Any user referenced by a visible record must be resolvable by name on screen.
      const referencedUserIds = new Set<string>([actor.sub, ...adminIdSet]);
      if (actor.role === "teacher" || actor.role === "student") {
        const ownProfile =
          profileByUser.get(actor.sub) ??
          studentProfileRows.find((row) => row.userId === actor.sub);
        if (ownProfile?.managerId) referencedUserIds.add(ownProfile.managerId);
      }
      teacherIds.forEach((id) => referencedUserIds.add(id));
      studentIds.forEach((id) => referencedUserIds.add(id));
      visibleCourses.forEach((row) => referencedUserIds.add(row.ownerId));
      visibleLessons.forEach((row) => {
        referencedUserIds.add(row.teacherId);
        referencedUserIds.add(row.studentId);
        referencedUserIds.add(row.createdBy);
        if (row.planAttachedBy) referencedUserIds.add(row.planAttachedBy);
      });
      visibleRequests.forEach((row) => {
        referencedUserIds.add(row.requestedBy);
        if (row.reviewedBy) referencedUserIds.add(row.reviewedBy);
      });
      visibleAbsences.forEach((row) => referencedUserIds.add(row.reportedBy));
      visibleRatings.forEach((row) => {
        if (row.authorId) referencedUserIds.add(row.authorId);
      });
      visibleCredits.forEach((row) => referencedUserIds.add(row.actorId));

      const visibleUsers = isAdmin
        ? userRows
        : userRows.filter((row) => referencedUserIds.has(row.id));
      const visibleTeacherProfiles = teacherProfileRows.filter((row) =>
        teacherIds.has(row.userId),
      );
      const visibleStudentProfiles = studentProfileRows.filter((row) =>
        studentIds.has(row.userId),
      );

      const attachmentIds = new Set<string>();
      visiblePlans.forEach((plan) =>
        plan.attachmentIds.forEach((id) => attachmentIds.add(id)),
      );
      visibleRequests.forEach((row) => {
        if (row.attachmentId) attachmentIds.add(row.attachmentId);
      });
      const visibleAttachments = attachmentRows.filter((row) =>
        attachmentIds.has(row.id),
      );

      const settingsRow = settingsRows[0];

      return {
        version: SCHOOL_SCHEMA_VERSION,
        seededAt: new Date().toISOString(),
        settings: {
          schoolName: settingsRow?.schoolName ?? "Lumina ESL",
          onTheSpotCancellationHours:
            settingsRow?.onTheSpotCancellationHours ?? 2,
          performanceWindowDays: settingsRow?.performanceWindowDays ?? 30,
          bookingDayStart: settingsRow?.bookingDayStart ?? "08:00",
          bookingDayEnd: settingsRow?.bookingDayEnd ?? "23:30",
          studentLateCancellationHours:
            settingsRow?.studentLateCancellationHours ?? 24,
          refundTeacherCancellations:
            settingsRow?.refundTeacherCancellations ?? true,
        },
        collections: {
          users: toRecord(
            visibleUsers.map((row) => ({
              id: row.id,
              role: row.role,
              name: row.name,
              email: row.email,
              status: row.status,
              avatarColor: row.avatarColor,
              createdAt: iso(row.createdAt) ?? "",
            })),
          ),
          teacherProfiles: toRecord(
            visibleTeacherProfiles.map((row) => ({
              id: row.userId,
              userId: row.userId,
              managerId: row.managerId,
              headline: row.headline,
              specializations: row.specializations,
              languages: row.languages,
              bio: row.bio,
              hireDate: row.hireDate,
              weeklyGoalHours: row.weeklyGoalHours,
            })),
          ),
          studentProfiles: toRecord(
            visibleStudentProfiles.map((row) => ({
              id: row.userId,
              userId: row.userId,
              managerId: row.managerId,
              level: row.level,
              targetLevel: row.targetLevel,
              goal: row.goal,
              guardian: row.guardianName
                ? {
                    name: row.guardianName,
                    email: row.guardianEmail ?? "",
                    phone: row.guardianPhone ?? undefined,
                    relationship: row.guardianRelationship ?? undefined,
                  }
                : undefined,
            })),
          ),
          courses: toRecord(
            visibleCourses.map((row) => ({
              id: row.id,
              title: row.title,
              level: row.level,
              summary: row.summary,
              objectives: row.objectives,
              status: row.status,
              ownerId: row.ownerId,
              createdAt: iso(row.createdAt) ?? "",
              updatedAt: iso(row.updatedAt) ?? "",
            })),
          ),
          courseUnits: toRecord(
            visibleUnits.map((row) => ({
              id: row.id,
              courseId: row.courseId,
              order: row.order,
              title: row.title,
            })),
          ),
          lessonPlans: toRecord(
            visiblePlans.map((row) => ({
              id: row.id,
              unitId: row.unitId,
              order: row.order,
              title: row.title,
              focus: row.focus,
              summary: row.summary,
              sections: row.sections,
              attachmentIds: row.attachmentIds,
              updatedAt: iso(row.updatedAt) ?? "",
            })),
          ),
          attachments: toRecord(
            visibleAttachments.map((row) => ({
              id: row.id,
              name: row.name,
              type: row.type,
              size: row.size,
              storageKey: row.storageKey,
              uploadedBy: row.uploadedBy,
              uploadedAt: iso(row.uploadedAt) ?? "",
            })),
          ),
          enrollments: toRecord(
            visibleEnrollments.map((row) => ({
              id: row.id,
              studentId: row.studentId,
              teacherId: row.teacherId,
              courseId: row.courseId,
              nextPlanIndex: row.nextPlanIndex,
              status: row.status,
              startedAt: iso(row.startedAt) ?? "",
            })),
          ),
          lessons: toRecord(
            visibleLessons.map((row) => ({
              id: row.id,
              enrollmentId: row.enrollmentId ?? undefined,
              teacherId: row.teacherId,
              studentId: row.studentId,
              date: row.date,
              time: row.time,
              endTime: row.endTime,
              title: row.title,
              focus: row.focus,
              status: row.status,
              roomCode: row.roomCode ?? undefined,
              lessonPlanId:
                row.lessonPlanId && visiblePlanIds.has(row.lessonPlanId)
                  ? row.lessonPlanId
                  : undefined,
              planAttachedBy: row.planAttachedBy ?? undefined,
              planAttachedAt: iso(row.planAttachedAt),
              notes: row.notes ?? undefined,
              homework: row.homework ?? undefined,
              attendance: row.attendance ?? undefined,
              feedback: row.feedback ?? undefined,
              scores: row.scores,
              corrections: row.corrections,
              cancelReason: row.cancelReason ?? undefined,
              createdBy: row.createdBy,
              createdAt: iso(row.createdAt) ?? "",
            })),
          ),
          slotOpenings: toRecord(
            visibleSlots.map((row) => ({
              id: row.id,
              teacherId: row.teacherId,
              date: row.date,
              time: row.time,
              openedAt: iso(row.openedAt) ?? "",
              openedBy: row.openedBy,
            })),
          ),
          requests: toRecord(
            visibleRequests.map((row) =>
              row.type === "slot-closure"
                ? {
                    id: row.id,
                    type: row.type,
                    teacherId: row.teacherId,
                    date: row.date ?? "",
                    time: row.time ?? "",
                    reason: row.reason,
                    comment: row.comment ?? undefined,
                    attachmentId: row.attachmentId ?? undefined,
                    status: row.status,
                    requestedAt: iso(row.requestedAt) ?? "",
                    requestedBy: row.requestedBy,
                    reviewedBy: row.reviewedBy ?? undefined,
                    reviewedAt: iso(row.reviewedAt),
                    reviewNote: row.reviewNote ?? undefined,
                  }
                : {
                    id: row.id,
                    type: row.type,
                    teacherId: row.teacherId,
                    lessonId: row.lessonId ?? "",
                    reason: row.reason,
                    comment: row.comment ?? undefined,
                    attachmentId: row.attachmentId ?? undefined,
                    status: row.status,
                    requestedAt: iso(row.requestedAt) ?? "",
                    requestedBy: row.requestedBy,
                    reviewedBy: row.reviewedBy ?? undefined,
                    reviewedAt: iso(row.reviewedAt),
                    reviewNote: row.reviewNote ?? undefined,
                  },
            ),
          ),
          absences: toRecord(
            visibleAbsences.map((row) => ({
              id: row.id,
              lessonId: row.lessonId,
              teacherId: row.teacherId,
              note: row.note,
              reportedBy: row.reportedBy,
              reportedAt: iso(row.reportedAt) ?? "",
            })),
          ),
          ratings: toRecord(
            visibleRatings.map((row) => ({
              id: row.id,
              lessonId: row.lessonId,
              teacherId: row.teacherId,
              studentId: row.studentId,
              from: row.from,
              authorId: row.authorId ?? undefined,
              authorName: row.authorName,
              score: row.score as 1 | 2 | 3 | 4 | 5,
              comment: row.comment ?? undefined,
              createdAt: iso(row.createdAt) ?? "",
            })),
          ),
          assignments: toRecord(
            visibleAssignments.map((row) => ({
              id: row.id,
              studentId: row.studentId,
              teacherId: row.teacherId,
              title: row.title,
              type: row.type,
              description: row.description,
              instructions: row.instructions,
              dueLabel: row.dueLabel,
              status: row.status,
              response: row.response ?? undefined,
              submittedAt: iso(row.submittedAt),
              feedback: row.feedback ?? undefined,
              grade: row.grade ?? undefined,
              reviewedAt: iso(row.reviewedAt),
              createdAt: iso(row.createdAt) ?? "",
            })),
          ),
          credits: toRecord(
            visibleCredits.map((row) => ({
              id: row.id,
              studentId: row.studentId,
              hours: row.hours,
              amount: row.amount ?? undefined,
              reason: row.reason,
              description: row.description,
              lessonId: row.lessonId ?? undefined,
              actorId: row.actorId,
              createdAt: iso(row.createdAt) ?? "",
            })),
          ),
          activity: toRecord(
            visibleActivity.map((row) => ({
              id: row.id,
              actorId: row.actorId,
              action: row.action,
              targetType: row.targetType,
              targetId: row.targetId,
              summary: row.summary,
              createdAt: iso(row.createdAt) ?? "",
            })),
          ),
        },
      };
    },
  );
};
