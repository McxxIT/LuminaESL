import { describe, expect, it } from "vitest";
import {
  avatarColor,
  buildImportPlan,
  importPayloadSchema,
  type ExistingSchool,
  type ImportPayload,
} from "../src/lib/school-import";

/**
 * Planner tests only: `buildImportPlan` is pure, so every mapping rule that would
 * otherwise need a live database is asserted here. The endpoint itself is covered
 * by `frontend/e2e/api/import.spec.ts`.
 */

const SEEDED_AT = "2026-01-01T00:00:00.000Z";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY_EXISTING: ExistingSchool = {
  userIdByEmail: new Map(),
  teacherProfileUserIds: new Set(),
  studentProfileUserIds: new Set(),
  attachmentIds: new Set(),
};

function payload(overrides: {
  users?: Record<string, unknown>;
  teacherProfiles?: Record<string, unknown>;
  studentProfiles?: Record<string, unknown>;
  courses?: Record<string, unknown>;
  courseUnits?: Record<string, unknown>;
  lessonPlans?: Record<string, unknown>;
  attachments?: Record<string, unknown>;
  enrollments?: Record<string, unknown>;
  lessons?: Record<string, unknown>;
  requests?: Record<string, unknown>;
  credits?: Record<string, unknown>;
  activity?: Record<string, unknown>;
  uploads?: Record<string, string>;
  exclude?: Record<string, string[]>;
  options?: Record<string, boolean>;
}): ImportPayload {
  return importPayloadSchema.parse({
    source: {
      version: 3,
      seededAt: SEEDED_AT,
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
        users: overrides.users ?? {},
        teacherProfiles: overrides.teacherProfiles ?? {},
        studentProfiles: overrides.studentProfiles ?? {},
        courses: overrides.courses ?? {},
        courseUnits: overrides.courseUnits ?? {},
        lessonPlans: overrides.lessonPlans ?? {},
        attachments: overrides.attachments ?? {},
        enrollments: overrides.enrollments ?? {},
        lessons: overrides.lessons ?? {},
        slotOpenings: {},
        requests: overrides.requests ?? {},
        absences: {},
        ratings: {},
        assignments: {},
        credits: overrides.credits ?? {},
        activity: overrides.activity ?? {},
      },
    },
    attachments: overrides.uploads ?? {},
    exclude: overrides.exclude ?? {},
    options: overrides.options ?? {},
  });
}

const existing: ExistingSchool = {
  userIdByEmail: new Map([
    ["admin@lumina.school", "11111111-1111-4111-8111-111111111111"],
    ["teacher@lumina.school", "22222222-2222-4222-8222-222222222222"],
  ]),
  teacherProfileUserIds: new Set(["22222222-2222-4222-8222-222222222222"]),
  studentProfileUserIds: new Set(),
  attachmentIds: new Set(),
};

function plan(input: ImportPayload, dryRun = false) {
  return buildImportPlan(input, existing, {
    actorId: "99999999-9999-4999-8999-999999999999",
    defaultPasswordHash: "hash",
    dryRun,
  });
}

const student = {
  id: "local-student",
  role: "student",
  name: "Imported Student",
  email: "Imported-Student@Lumina.school",
  status: "active",
  avatarColor: "peach",
  createdAt: "2026-01-02T10:00:00.000Z",
};

const teacher = {
  id: "local-teacher",
  role: "teacher",
  name: "Tom Teacher",
  email: "teacher@lumina.school",
  status: "active",
  avatarColor: "mint",
  createdAt: "2026-01-02T10:00:00.000Z",
};

const course = {
  id: "local-course",
  title: "Imported course",
  level: "B1",
  summary: "",
  objectives: [],
  status: "published",
  ownerId: "local-teacher",
  createdAt: "2026-01-02T10:00:00.000Z",
  updatedAt: "2026-01-02T10:00:00.000Z",
};

const unit = { id: "local-unit", courseId: "local-course", order: 1, title: "Unit 1" };
const planRecord = {
  id: "local-plan",
  unitId: "local-unit",
  order: 1,
  title: "Plan 1",
  focus: [],
  summary: "",
  sections: [],
  attachmentIds: [],
  updatedAt: "2026-01-02T10:00:00.000Z",
};
const enrollment = {
  id: "local-enrollment",
  studentId: "local-student",
  teacherId: "local-teacher",
  courseId: "local-course",
  nextPlanIndex: 0,
  status: "active",
  startedAt: "2026-01-02T10:00:00.000Z",
};
const lesson = {
  id: "local-lesson",
  enrollmentId: "local-enrollment",
  teacherId: "local-teacher",
  studentId: "local-student",
  date: "2026-01-03",
  time: "10:00",
  endTime: "10:20",
  title: "Imported lesson",
  focus: [],
  status: "completed",
  lessonPlanId: "local-plan",
  attendance: "attended",
  createdBy: "local-student",
  createdAt: "2026-01-03T11:00:00.000Z",
};

describe("buildImportPlan", () => {
  it("maps local slug ids to UUIDs and keeps the lesson history", () => {
    const result = plan(
      payload({
        users: { "local-student": student, "local-teacher": teacher },
        courses: { "local-course": course },
        courseUnits: { "local-unit": unit },
        lessonPlans: { "local-plan": planRecord },
        enrollments: { "local-enrollment": enrollment },
        lessons: { "local-lesson": lesson },
      }),
    );

    expect(result.marker).toBe(SEEDED_AT);
    const lessonRow = result.rows.lessons[0];
    expect(lessonRow).toBeDefined();
    expect(lessonRow?.id).toMatch(UUID);
    expect(lessonRow?.endTime, "the 20-minute lesson keeps its real end time").toBe("10:20");
    expect(lessonRow?.teacherId).toBe("22222222-2222-4222-8222-222222222222");
    expect(lessonRow?.studentId).toBe(result.idMap["local-student"]);
    expect(lessonRow?.createdBy).toBe(result.idMap["local-student"]);
    expect(lessonRow?.createdAt?.toISOString()).toBe("2026-01-03T11:00:00.000Z");
    expect(lessonRow?.attendance).toBe("attended");
    expect(lessonRow?.lessonPlanId).toBe(result.idMap["local-plan"]);
  });

  it("adopts users by email instead of inserting a duplicate", () => {
    const result = plan(
      payload({ users: { "local-teacher": teacher, "local-student": student } }),
    );

    expect(result.idMap["local-teacher"]).toBe("22222222-2222-4222-8222-222222222222");
    expect(result.counts.users.adopted).toBe(1);
    expect(result.counts.users.created).toBe(1);
    expect(result.rows.users).toHaveLength(1);
    expect(result.rows.users[0]?.email, "emails are stored lower-case").toBe(
      "imported-student@lumina.school",
    );
    expect(result.rows.users[0]?.passwordHash).toBe("hash");
  });

  it("adopts the existing teacher profile for an adopted teacher", () => {
    const result = plan(
      payload({
        teacherProfiles: {
          "local-teacher": {
            id: "local-teacher",
            userId: "local-teacher",
            managerId: null,
            headline: "Headline",
            specializations: [],
            languages: [],
            bio: "",
            hireDate: "2025-05-01",
            weeklyGoalHours: 10,
          },
        },
        users: { "local-teacher": teacher },
      }),
    );

    expect(result.counts.teacherProfiles.adopted).toBe(1);
    expect(result.rows.teacherProfiles).toHaveLength(0);
  });

  it("keeps the user id when a profile shares the user's local id", () => {
    // The browser store keys profiles by user, so `studentProfiles["local-student"].id`
    // is also "local-student". Mapping the profile into the flat id map used to point
    // `enrollments.student_id` at a profile row and fail the FK on insert.
    const result = plan(
      payload({
        users: { "local-student": student, "local-teacher": teacher },
        studentProfiles: {
          "local-student": {
            id: "local-student",
            userId: "local-student",
            managerId: null,
            level: "B1",
            targetLevel: "B2",
            goal: "Import fixture",
          },
        },
        courses: { "local-course": course },
        courseUnits: { "local-unit": unit },
        lessonPlans: { "local-plan": planRecord },
        enrollments: { "local-enrollment": enrollment },
        lessons: { "local-lesson": lesson },
      }),
    );

    const studentUserId = result.rows.users[0]?.id;
    const profileId = result.rows.studentProfiles[0]?.id;
    expect(studentUserId).toMatch(UUID);
    expect(profileId).toMatch(UUID);
    expect(profileId).not.toBe(studentUserId);
    expect(result.idMap["local-student"], "the flat map stays a user id").toBe(studentUserId);
    expect(result.rows.enrollments[0]?.studentId).toBe(studentUserId);
    expect(result.rows.lessons[0]?.studentId).toBe(studentUserId);
    expect(result.createdIds.studentProfiles, "the profile is still receipted").toEqual([
      profileId,
    ]);
  });

  it("skips seed-identical records by default and imports them when asked", () => {
    const seedLesson = { ...lesson, id: "lesson-grace-3" };
    const excluded = { lessons: ["lesson-grace-3"] };

    const filtered = plan(
      payload({
        users: { "local-student": student, "local-teacher": teacher },
        courses: { "local-course": course },
        courseUnits: { "local-unit": unit },
        lessonPlans: { "local-plan": planRecord },
        enrollments: { "local-enrollment": enrollment },
        lessons: { "lesson-grace-3": seedLesson },
        exclude: excluded,
      }),
    );
    expect(filtered.rows.lessons).toHaveLength(0);
    expect(filtered.counts.lessons.skippedSeed).toBe(1);

    const everything = plan(
      payload({
        users: { "local-student": student, "local-teacher": teacher },
        courses: { "local-course": course },
        courseUnits: { "local-unit": unit },
        lessonPlans: { "local-plan": planRecord },
        enrollments: { "local-enrollment": enrollment },
        lessons: { "lesson-grace-3": seedLesson },
        exclude: excluded,
        options: { includeSeedRecords: true },
      }),
    );
    expect(everything.rows.lessons).toHaveLength(1);
    expect(everything.counts.lessons.skippedSeed).toBe(0);
  });

  it("drops records with a missing required parent and nulls optional references", () => {
    const orphanLesson = { ...lesson, id: "local-orphan", enrollmentId: undefined };
    const result = plan(
      payload({
        users: { "local-student": student, "local-teacher": teacher },
        // Course omitted, so the enrollment has no course.
        courseUnits: { "local-unit": unit },
        lessons: { "local-lesson": { ...lesson, lessonPlanId: "local-plan", enrollmentId: "local-enrollment" } },
        enrollments: { "local-enrollment": enrollment },
      }),
    );

    expect(result.rows.enrollments).toHaveLength(0);
    expect(result.counts.enrollments.dropped).toBe(1);
    const lessonRow = result.rows.lessons[0];
    expect(lessonRow).toBeDefined();
    expect(lessonRow?.enrollmentId, "an optional parent that was dropped becomes null").toBeNull();
    expect(lessonRow?.lessonPlanId, "an optional plan that was dropped becomes null").toBeNull();
    expect(result.warnings.some((warning) => warning.code === "missing-parent")).toBe(true);

    const noStudent = plan(payload({ lessons: { "local-orphan": orphanLesson } }));
    expect(noStudent.rows.lessons).toHaveLength(0);
    expect(noStudent.counts.lessons.dropped).toBe(1);
  });

  it("keeps request review state, credit sign, and activity actors", () => {
    const result = plan(
      payload({
        users: {
          "local-student": student,
          "local-teacher": teacher,
          "local-admin": {
            id: "local-admin",
            role: "admin",
            name: "Ada Admin",
            email: "admin@lumina.school",
            status: "active",
            avatarColor: "indigo",
            createdAt: "2026-01-02T10:00:00.000Z",
          },
        },
        courses: { "local-course": course },
        courseUnits: { "local-unit": unit },
        lessonPlans: { "local-plan": planRecord },
        enrollments: { "local-enrollment": enrollment },
        lessons: { "local-lesson": lesson },
        requests: {
          "local-request": {
            id: "local-request",
            type: "lesson-cancellation",
            teacherId: "local-teacher",
            lessonId: "local-lesson",
            reason: "Teacher was ill",
            status: "approved",
            requestedAt: "2026-01-03T09:00:00.000Z",
            requestedBy: "local-teacher",
            reviewedBy: "local-admin",
            reviewedAt: "2026-01-03T09:30:00.000Z",
            reviewNote: "Approved",
          },
        },
        credits: {
          "local-credit": {
            id: "local-credit",
            studentId: "local-student",
            hours: -1,
            reason: "booking",
            description: "Booked a lesson",
            lessonId: "local-lesson",
            actorId: "local-student",
            createdAt: "2026-01-03T09:10:00.000Z",
          },
        },
        activity: {
          "local-activity": {
            id: "local-activity",
            actorId: "local-student",
            action: "lesson.booked",
            targetType: "lesson",
            targetId: "local-lesson",
            summary: "Booked",
            createdAt: "2026-01-03T09:10:00.000Z",
          },
        },
      }),
    );

    const requestRow = result.rows.requests[0];
    expect(requestRow?.status).toBe("approved");
    expect(requestRow?.reviewedAt?.toISOString()).toBe("2026-01-03T09:30:00.000Z");
    expect(requestRow?.reviewedBy, "the reviewer is the adopted admin").toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(requestRow?.lessonId).toBe(result.idMap["local-lesson"]);

    const creditRow = result.rows.credits[0];
    expect(creditRow?.hours, "a booking debit stays a debit").toBe(-1);
    expect(creditRow?.createdAt?.toISOString()).toBe("2026-01-03T09:10:00.000Z");

    const activityRow = result.rows.activity[0];
    expect(activityRow?.actorId).toBe(result.idMap["local-student"]);
    expect(activityRow?.targetId, "activity targets are remapped when known").toBe(
      result.idMap["local-lesson"],
    );
  });

  it("counts attachments waiting for an upload in preview, drops them in a real run", () => {
    const attachment = {
      id: "local-attachment",
      name: "evidence.pdf",
      type: "application/pdf",
      size: 12,
      storageKey: "lumina-school-file:local-attachment",
      uploadedBy: "local-student",
      uploadedAt: "2026-01-02T10:00:00.000Z",
    };

    const preview = plan(
      payload({ users: { "local-student": student }, attachments: { "local-attachment": attachment } }),
      true,
    );
    expect(preview.pendingUploads).toBe(1);
    expect(preview.counts.attachments.dropped).toBe(0);

    const real = plan(
      payload({ users: { "local-student": student }, attachments: { "local-attachment": attachment } }),
    );
    expect(real.pendingUploads).toBe(0);
    expect(real.counts.attachments.dropped).toBe(1);
    expect(real.warnings.some((warning) => warning.code === "missing-bytes")).toBe(true);
  });

  it("adopts an uploaded attachment and points plan attachments at it", () => {
    const uploadedId = "33333333-3333-4333-8333-333333333333";
    const result = buildImportPlan(
      payload({
        users: { "local-student": student },
        attachments: {
          "local-attachment": {
            id: "local-attachment",
            name: "evidence.pdf",
            type: "application/pdf",
            size: 12,
            storageKey: "lumina-school-file:local-attachment",
            uploadedBy: "local-student",
            uploadedAt: "2026-01-02T10:00:00.000Z",
          },
        },
        uploads: { "local-attachment": uploadedId },
      }),
      { ...EMPTY_EXISTING, attachmentIds: new Set([uploadedId]) },
      { actorId: "99999999-9999-4999-8999-999999999999", defaultPasswordHash: "hash", dryRun: false },
    );

    expect(result.counts.attachments.adopted).toBe(1);
    expect(result.idMap["local-attachment"]).toBe(uploadedId);
  });

  it("maps the demo avatar palette to the hex the API accepts", () => {
    expect(avatarColor("mint")).toBe("#10b981");
    expect(avatarColor("peach")).toBe("#f97316");
    expect(avatarColor("indigo")).toBe("#6366f1");
    expect(avatarColor("#AABBCC")).toBe("#aabbcc");
    expect(avatarColor("unknown")).toBe("#6366f1");
    expect(avatarColor(undefined)).toBe("#6366f1");
  });

  it("applies settings only when the caller opts in", () => {
    expect(plan(payload({})).settings).toBeNull();
    const withSettings = plan(payload({ options: { importSettings: true } }));
    expect(withSettings.settings?.schoolName).toBe("Lumina ESL");
    expect(withSettings.settings?.id).toBe(1);
  });
});

describe("importPayloadSchema", () => {
  it("rejects a payload from a different schema version", () => {
    const raw = JSON.parse(JSON.stringify(payload({}))) as Record<string, unknown>;
    const source = raw.source as Record<string, unknown>;
    source.version = 2;
    expect(() => importPayloadSchema.parse(raw)).toThrow();
  });

  it("rejects a payload with no seed timestamp", () => {
    const raw = JSON.parse(JSON.stringify(payload({}))) as Record<string, unknown>;
    const source = raw.source as Record<string, unknown>;
    source.seededAt = "";
    expect(() => importPayloadSchema.parse(raw)).toThrow();
  });
});
