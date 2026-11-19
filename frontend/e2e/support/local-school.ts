/**
 * A synthetic local school for the import specs. It is deliberately small but
 * covers every mapping rule the import cares about: an adopted user (email exists
 * on the server), a brand-new user, a course/unit/plan chain, an enrollment, a
 * completed lesson with a fixed historical timestamp, an approved request with
 * review metadata, a rating, a credit entry, and one attachment whose bytes live
 * in `lumina-school-file:<id>`.
 *
 * Ids are local slugs, never UUIDs — that is also how the app tells a local
 * snapshot from a previous API cache.
 */

export const ATTACHMENT_ID = "local-attachment";
export const ATTACHMENT_FILE_KEY = `lumina-school-file:${ATTACHMENT_ID}`;
const ATTACHMENT_BODY = "%PDF-1.4\n% import fixture\n%%EOF\n";
export const ATTACHMENT_DATA_URL = `data:application/pdf;base64,${Buffer.from(ATTACHMENT_BODY, "utf8").toString("base64")}`;

export type LocalSchoolFixture = ReturnType<typeof createLocalSchoolFixture>;

export function createLocalSchoolFixture(runId: string) {
  const seededAt = new Date().toISOString();
  const studentEmail = `import-${runId.toLowerCase()}@lumina.school`;
  const createdAt = "2026-01-02T10:00:00.000Z";
  const creditCreatedAt = "2025-12-01T08:00:00.000Z";

  const data = {
    version: 3,
    seededAt,
    settings: {
      schoolName: "Lumina ESL",
      onTheSpotCancellationHours: 2,
      performanceWindowDays: 30,
      bookingDayStart: "08:00",
      bookingDayEnd: "23:30",
      studentLateCancellationHours: 24,
      refundTeacherCancellations: true,
    },
    collections: {
      users: {
        "local-admin": {
          id: "local-admin",
          role: "admin",
          name: "Ada Admin",
          email: "admin@lumina.school",
          status: "active",
          avatarColor: "indigo",
          createdAt,
        },
        "local-teacher": {
          id: "local-teacher",
          role: "teacher",
          name: "Tom Teacher",
          email: "teacher@lumina.school",
          status: "active",
          avatarColor: "mint",
          createdAt,
        },
        "local-student": {
          id: "local-student",
          role: "student",
          name: `Import Student ${runId}`,
          email: studentEmail,
          status: "active",
          avatarColor: "peach",
          createdAt,
        },
      },
      teacherProfiles: {
        "local-teacher": {
          id: "local-teacher",
          userId: "local-teacher",
          managerId: null,
          headline: "Imported teacher fixture",
          specializations: ["Grammar"],
          languages: ["English"],
          bio: "",
          hireDate: "2025-05-01",
          weeklyGoalHours: 20,
        },
      },
      studentProfiles: {
        "local-student": {
          id: "local-student",
          userId: "local-student",
          managerId: null,
          level: "B1",
          targetLevel: "B2",
          goal: `Import fixture ${runId}`,
        },
      },
      courses: {
        "local-course": {
          id: "local-course",
          title: `Import fixture course ${runId}`,
          level: "B1",
          summary: "Created before the cutover",
          objectives: ["Prove history survives"],
          status: "published",
          ownerId: "local-admin",
          createdAt,
          updatedAt: createdAt,
        },
      },
      courseUnits: {
        "local-unit": {
          id: "local-unit",
          courseId: "local-course",
          order: 1,
          title: `Import fixture unit ${runId}`,
        },
      },
      lessonPlans: {
        "local-plan": {
          id: "local-plan",
          unitId: "local-unit",
          order: 1,
          title: `Import fixture plan ${runId}`,
          focus: ["Speaking"],
          summary: "Attached before the cutover",
          sections: [{ heading: "Warm up", items: ["Say hello"] }],
          attachmentIds: [ATTACHMENT_ID],
          updatedAt: createdAt,
        },
      },
      attachments: {
        [ATTACHMENT_ID]: {
          id: ATTACHMENT_ID,
          name: "import-fixture.pdf",
          type: "application/pdf",
          size: Buffer.byteLength(ATTACHMENT_BODY, "utf8"),
          storageKey: ATTACHMENT_FILE_KEY,
          uploadedBy: "local-student",
          uploadedAt: createdAt,
        },
      },
      enrollments: {
        "local-enrollment": {
          id: "local-enrollment",
          studentId: "local-student",
          teacherId: "local-teacher",
          courseId: "local-course",
          nextPlanIndex: 1,
          status: "active",
          startedAt: createdAt,
        },
      },
      lessons: {
        "local-lesson": {
          id: "local-lesson",
          enrollmentId: "local-enrollment",
          teacherId: "local-teacher",
          studentId: "local-student",
          date: "2031-03-05",
          time: "09:00",
          endTime: "09:25",
          title: `Import fixture lesson ${runId}`,
          focus: ["Speaking"],
          status: "completed",
          roomCode: "ESL-IMPORT",
          lessonPlanId: "local-plan",
          planAttachedBy: "local-admin",
          planAttachedAt: createdAt,
          attendance: "attended",
          feedback: "Imported feedback",
          createdBy: "local-student",
          createdAt,
        },
      },
      slotOpenings: {},
      requests: {
        "local-request": {
          id: "local-request",
          type: "lesson-cancellation",
          teacherId: "local-teacher",
          lessonId: "local-lesson",
          reason: "Teacher was ill",
          comment: `Import fixture ${runId}`,
          attachmentId: ATTACHMENT_ID,
          status: "approved",
          requestedAt: "2026-01-02T09:00:00.000Z",
          requestedBy: "local-teacher",
          reviewedBy: "local-admin",
          reviewedAt: "2026-01-02T09:30:00.000Z",
          reviewNote: "Approved before the cutover",
        },
      },
      absences: {},
      ratings: {
        "local-rating": {
          id: "local-rating",
          lessonId: "local-lesson",
          teacherId: "local-teacher",
          studentId: "local-student",
          from: "student",
          authorId: "local-student",
          authorName: `Import Student ${runId}`,
          score: 5,
          comment: "Great lesson",
          createdAt,
        },
      },
      assignments: {},
      credits: {
        "local-credit": {
          id: "local-credit",
          studentId: "local-student",
          hours: 4,
          amount: 160,
          reason: "purchase",
          description: `Import fixture credits ${runId}`,
          actorId: "local-student",
          createdAt: creditCreatedAt,
        },
      },
      activity: {},
    },
  };

  return {
    data,
    raw: JSON.stringify(data),
    markers: {
      seededAt,
      studentEmail,
      courseTitle: data.collections.courses["local-course"].title,
      lessonTitle: data.collections.lessons["local-lesson"].title,
      lessonCreatedAt: createdAt,
      creditCreatedAt,
      creditHours: 4,
      attachmentName: "import-fixture.pdf",
      attachmentBody: ATTACHMENT_BODY,
      requestComment: `Import fixture ${runId}`,
    },
  };
}

/** Seeds the browser before any app code runs, so the first API bootstrap sees it. */
export function seedLocalSchoolArgs(fixture: LocalSchoolFixture) {
  return {
    raw: fixture.raw,
    fileKey: ATTACHMENT_FILE_KEY,
    dataUrl: ATTACHMENT_DATA_URL,
  };
}
