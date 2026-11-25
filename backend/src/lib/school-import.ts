import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
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
} from "../db/schema.js";
import type { DbOrTx } from "./db-handle.js";
import { unusablePasswordHash } from "./password.js";

/**
 * One-time import of a browser school store (`SchoolData` v3) into Postgres.
 *
 * The public REST endpoints cannot carry this: they cannot set `createdAt`, `createdBy`,
 * `actorId`, request review state, or `endTime`, and `POST /bookings` / absence recording
 * would fabricate credit movements. The planner below maps local slug ids to fresh UUIDs,
 * keeps every timestamp and actor, and the applier writes the whole plan in one transaction.
 *
 * Pure by design: `buildImportPlan` takes everything it needs as arguments so it can be
 * unit-tested without a database.
 */

const id = z.string().min(1);
const optionalText = z.string().nullish();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const clock = z.string().min(4);

const userSchema = z.object({
  id,
  role: z.enum(["admin", "manager", "teacher", "student"]),
  name: z.string().min(1),
  email: z.string().min(3),
  status: z.enum(["active", "paused", "archived"]).default("active"),
  avatarColor: z.string().optional(),
  createdAt: z.string().optional(),
});

const teacherProfileSchema = z.object({
  id,
  userId: id,
  managerId: z.string().nullish(),
  headline: z.string().default(""),
  specializations: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  bio: z.string().default(""),
  hireDate: isoDate,
  weeklyGoalHours: z.number().int().default(0),
});

const studentProfileSchema = z.object({
  id,
  userId: id,
  managerId: z.string().nullish(),
  level: z.string().default("beginner"),
  targetLevel: z.string().default("intermediate"),
  goal: z.string().default(""),
  guardian: z
    .object({
      name: z.string().default(""),
      email: z.string().default(""),
      phone: optionalText,
      relationship: optionalText,
    })
    .nullish(),
});

const courseSchema = z.object({
  id,
  title: z.string().min(1),
  level: z.string().default(""),
  summary: z.string().default(""),
  objectives: z.array(z.string()).default([]),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  ownerId: id,
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const unitSchema = z.object({
  id,
  courseId: id,
  order: z.number().int().default(0),
  title: z.string().min(1),
});

const planSectionSchema = z.object({
  heading: z.string().default(""),
  items: z.array(z.string()).default([]),
});

const lessonPlanSchema = z.object({
  id,
  unitId: id,
  order: z.number().int().default(0),
  title: z.string().min(1),
  focus: z.array(z.string()).default([]),
  summary: z.string().default(""),
  sections: z.array(planSectionSchema).default([]),
  attachmentIds: z.array(z.string()).default([]),
  updatedAt: z.string().optional(),
});

const attachmentSchema = z.object({
  id,
  name: z.string().min(1),
  type: z.string().min(1),
  size: z.number().int().nonnegative().default(0),
  storageKey: z.string().default(""),
  uploadedBy: id,
  uploadedAt: z.string().optional(),
});

const enrollmentSchema = z.object({
  id,
  studentId: id,
  teacherId: id,
  courseId: id,
  nextPlanIndex: z.number().int().default(0),
  status: z.enum(["active", "paused", "completed", "ended"]).default("active"),
  startedAt: z.string().optional(),
});

const lessonSchema = z.object({
  id,
  enrollmentId: z.string().nullish(),
  teacherId: id,
  studentId: id,
  date: isoDate,
  time: clock,
  endTime: clock,
  title: z.string().min(1),
  focus: z.array(z.string()).default([]),
  status: z.enum(["scheduled", "live", "completed", "cancelled"]).default("scheduled"),
  roomCode: optionalText,
  lessonPlanId: z.string().nullish(),
  planAttachedBy: z.string().nullish(),
  planAttachedAt: z.string().nullish(),
  notes: optionalText,
  homework: optionalText,
  attendance: z.enum(["attended", "no-show"]).nullish(),
  feedback: optionalText,
  scores: z.array(z.object({ label: z.string(), value: z.number() })).default([]),
  corrections: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
  cancelReason: optionalText,
  createdBy: id,
  createdAt: z.string().optional(),
});

const slotSchema = z.object({
  id,
  teacherId: id,
  date: isoDate,
  time: clock,
  openedAt: z.string().optional(),
  openedBy: id,
});

const requestSchema = z.object({
  id,
  type: z.enum(["slot-closure", "lesson-cancellation"]),
  teacherId: id,
  date: z.string().nullish(),
  time: z.string().nullish(),
  lessonId: z.string().nullish(),
  reason: z.string().min(1),
  comment: optionalText,
  attachmentId: z.string().nullish(),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  requestedAt: z.string().optional(),
  requestedBy: id,
  reviewedBy: z.string().nullish(),
  reviewedAt: z.string().nullish(),
  reviewNote: optionalText,
});

const absenceSchema = z.object({
  id,
  lessonId: id,
  teacherId: id,
  note: z.string().default(""),
  reportedBy: id,
  reportedAt: z.string().optional(),
});

const ratingSchema = z.object({
  id,
  lessonId: id,
  teacherId: id,
  studentId: id,
  from: z.enum(["student", "parent"]).default("student"),
  authorId: z.string().nullish(),
  authorName: z.string().default(""),
  score: z.number().int().min(1).max(5),
  comment: optionalText,
  createdAt: z.string().optional(),
});

const assignmentSchema = z.object({
  id,
  studentId: id,
  teacherId: id,
  title: z.string().min(1),
  type: z.enum(["recording", "quiz", "reading", "writing"]),
  description: z.string().default(""),
  instructions: z.string().default(""),
  dueLabel: z.string().default(""),
  status: z.enum(["assigned", "submitted", "reviewed"]).default("assigned"),
  response: optionalText,
  submittedAt: z.string().nullish(),
  feedback: optionalText,
  grade: optionalText,
  reviewedAt: z.string().nullish(),
  createdAt: z.string().optional(),
});

const creditSchema = z.object({
  id,
  studentId: id,
  hours: z.number(),
  amount: z.number().int().nullish(),
  reason: z.enum(["purchase", "booking", "refund", "adjustment"]),
  description: z.string().default(""),
  lessonId: z.string().nullish(),
  actorId: id,
  createdAt: z.string().optional(),
});

const activitySchema = z.object({
  id,
  actorId: id,
  action: z.string().min(1),
  targetType: z.string().default("school"),
  targetId: z.string().default(""),
  summary: z.string().default(""),
  createdAt: z.string().optional(),
});

const settingsSchema = z.object({
  schoolName: z.string().default("Lumina ESL"),
  onTheSpotCancellationHours: z.number().int().default(2),
  performanceWindowDays: z.number().int().default(30),
  bookingDayStart: clock.default("08:00"),
  bookingDayEnd: clock.default("23:30"),
  studentLateCancellationHours: z.number().int().default(24),
  refundTeacherCancellations: z.boolean().default(true),
});

const collection = <T extends z.ZodTypeAny>(schema: T) =>
  z.record(z.string(), schema).default({});

export const importPayloadSchema = z.object({
  source: z.object({
    version: z.literal(3),
    seededAt: z.string().min(1),
    settings: settingsSchema,
    collections: z.object({
      users: collection(userSchema),
      teacherProfiles: collection(teacherProfileSchema),
      studentProfiles: collection(studentProfileSchema),
      courses: collection(courseSchema),
      courseUnits: collection(unitSchema),
      lessonPlans: collection(lessonPlanSchema),
      attachments: collection(attachmentSchema),
      enrollments: collection(enrollmentSchema),
      lessons: collection(lessonSchema),
      slotOpenings: collection(slotSchema),
      requests: collection(requestSchema),
      absences: collection(absenceSchema),
      ratings: collection(ratingSchema),
      assignments: collection(assignmentSchema),
      credits: collection(creditSchema),
      activity: collection(activitySchema),
    }),
  }),
  /** Local attachment id -> id returned by `POST /uploads` for the same bytes. */
  attachments: z.record(z.string(), z.string().uuid()).default({}),
  /** Per-collection ids the client identified as untouched demo seed rows. */
  exclude: z.record(z.string(), z.array(z.string())).default({}),
  options: z
    .object({
      includeSeedRecords: z.boolean().default(false),
      importSettings: z.boolean().default(false),
      force: z.boolean().default(false),
    })
    .default({}),
});

export type ImportPayload = z.infer<typeof importPayloadSchema>;
export type ImportWarning = {
  code:
    | "skipped-seed"
    | "missing-parent"
    | "unknown-user"
    | "missing-bytes"
    | "dropped-reference"
    | "status-reset";
  collection: string;
  localId: string;
  message: string;
};

export type ImportCount = {
  created: number;
  adopted: number;
  dropped: number;
  skippedSeed: number;
};

export type PlanRows = {
  users: (typeof users.$inferInsert)[];
  teacherProfiles: (typeof teacherProfiles.$inferInsert)[];
  studentProfiles: (typeof studentProfiles.$inferInsert)[];
  courses: (typeof courses.$inferInsert)[];
  courseUnits: (typeof courseUnits.$inferInsert)[];
  lessonPlans: (typeof lessonPlans.$inferInsert)[];
  enrollments: (typeof enrollments.$inferInsert)[];
  lessons: (typeof lessons.$inferInsert)[];
  slotOpenings: (typeof slotOpenings.$inferInsert)[];
  requests: (typeof requests.$inferInsert)[];
  absences: (typeof absences.$inferInsert)[];
  ratings: (typeof ratings.$inferInsert)[];
  assignments: (typeof assignments.$inferInsert)[];
  credits: (typeof creditEntries.$inferInsert)[];
  activity: (typeof activity.$inferInsert)[];
};

export type CollectionCounts = Record<keyof PlanRows | "attachments", ImportCount>;

export type ImportPlan = {
  marker: string;
  rows: PlanRows;
  settings: (typeof settings.$inferInsert) | null;
  idMap: Record<string, string>;
  createdIds: Record<string, string[]>;
  counts: CollectionCounts;
  warnings: ImportWarning[];
  warningsTruncated: boolean;
  /** Attachments the browser still has to upload before a real run. Preview only. */
  pendingUploads: number;
  totals: { created: number; adopted: number; dropped: number; skippedSeed: number };
};

export type ExistingSchool = {
  userIdByEmail: Map<string, string>;
  teacherProfileUserIds: Set<string>;
  studentProfileUserIds: Set<string>;
  attachmentIds: Set<string>;
};

const COLLECTIONS = [
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

const WARNING_LIMIT = 200;

/** Local avatar palette name -> the `#RRGGBB` the API column and regex expect. */
const AVATAR_COLORS: Record<string, string> = {
  mint: "#10b981",
  peach: "#f97316",
  lavender: "#8b5cf6",
  indigo: "#6366f1",
};

export function avatarColor(value: string | undefined): string {
  if (!value) return "#6366f1";
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  return AVATAR_COLORS[value] ?? "#6366f1";
}

function timestamp(value: string | null | undefined): Date {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function emptyCounts(): CollectionCounts {
  return Object.fromEntries(
    COLLECTIONS.map((key) => [
      key,
      { created: 0, adopted: 0, dropped: 0, skippedSeed: 0 },
    ]),
  ) as CollectionCounts;
}

/**
 * Turn a captured browser store into ordered insert batches.
 *
 * `dryRun` mirrors the real run exactly, except that attachments still waiting for
 * `POST /uploads` are counted instead of dropped — the client uploads them between
 * preview and import.
 */
export function buildImportPlan(
  payload: ImportPayload,
  existing: ExistingSchool,
  options: { actorId: string; dryRun: boolean },
): ImportPlan {
  const rows: PlanRows = {
    users: [],
    teacherProfiles: [],
    studentProfiles: [],
    courses: [],
    courseUnits: [],
    lessonPlans: [],
    enrollments: [],
    lessons: [],
    slotOpenings: [],
    requests: [],
    absences: [],
    ratings: [],
    assignments: [],
    credits: [],
    activity: [],
  };
  const idMap: Record<string, string> = {};
  const createdIds: Record<string, string[]> = Object.fromEntries(
    COLLECTIONS.map((key) => [key, [] as string[]]),
  );
  const counts = emptyCounts();
  const warnings: ImportWarning[] = [];
  let pendingUploads = 0;

  const excluded = new Map<string, Set<string>>();
  if (!payload.options.includeSeedRecords) {
    for (const [key, ids] of Object.entries(payload.exclude)) {
      excluded.set(key, new Set(ids));
    }
  }

  function warn(
    code: ImportWarning["code"],
    collection: string,
    localId: string,
    message: string,
  ) {
    if (warnings.length >= WARNING_LIMIT) return;
    warnings.push({ code, collection, localId, message });
  }

  /** Records excluded as untouched seed rows are counted, never warned one by one. */
  function isExcluded(collection: string, localId: string): boolean {
    const set = excluded.get(collection);
    if (!set?.has(localId)) return false;
    counts[collection as keyof CollectionCounts].skippedSeed += 1;
    return true;
  }

  function drop(
    collection: keyof CollectionCounts,
    localId: string,
    message: string,
    code: ImportWarning["code"] = "missing-parent",
  ) {
    counts[collection].dropped += 1;
    warn(code, collection, localId, message);
  }

  function created(collection: keyof PlanRows, localId: string, serverId: string) {
    idMap[localId] = serverId;
    counts[collection].created += 1;
    const ids = createdIds[collection] ?? (createdIds[collection] = []);
    ids.push(serverId);
  }

  /**
   * Profiles are keyed by their user in the browser store (`studentProfiles[id]` uses the
   * user's id as both key and `id`), so their local id collides with the user's. Nothing
   * references a profile by that id, so they are receipted under their own collection but
   * kept out of the flat map — which would otherwise point the user's id at a profile row
   * and make `enrollments.student_id` violate its foreign key.
   */
  function createdProfile(
    collection: "teacherProfiles" | "studentProfiles",
    serverId: string,
  ) {
    counts[collection].created += 1;
    const ids = createdIds[collection] ?? (createdIds[collection] = []);
    ids.push(serverId);
  }

  const source = payload.source.collections;

  // 1. Users: adopt by email (the server seed already holds the demo identities).
  // New accounts are created `invited` with a fresh unusable hash and no email;
  // an admin sends each invitation later from the admin screens.
  let statusResets = 0;
  for (const user of Object.values(source.users)) {
    if (isExcluded("users", user.id)) continue;
    const email = user.email.trim().toLowerCase();
    const existingId = existing.userIdByEmail.get(email);
    if (existingId) {
      idMap[user.id] = existingId;
      counts.users.adopted += 1;
      continue;
    }
    const serverId = randomUUID();
    const createdAt = timestamp(user.createdAt);
    rows.users.push({
      id: serverId,
      role: user.role,
      name: user.name,
      email,
      passwordHash: unusablePasswordHash(),
      status: "invited",
      avatarColor: avatarColor(user.avatarColor),
      createdAt,
      updatedAt: createdAt,
    });
    if (user.status !== "active") statusResets += 1;
    created("users", user.id, serverId);
  }
  if (statusResets > 0) {
    warn(
      "status-reset",
      "users",
      "*",
      `${statusResets} imported account(s) were not active in the browser; every new account is created invited.`,
    );
  }

  const mapUser = (localId: string | null | undefined): string | null =>
    localId ? idMap[localId] ?? null : null;

  // 2. Profiles: keyed by user; adopt when the user (and profile) already exist.
  for (const profile of Object.values(source.teacherProfiles)) {
    if (isExcluded("teacherProfiles", profile.id)) continue;
    const userId = mapUser(profile.userId);
    if (!userId) {
      drop("teacherProfiles", profile.id, "The teacher's user record was not imported.");
      continue;
    }
    if (existing.teacherProfileUserIds.has(userId)) {
      counts.teacherProfiles.adopted += 1;
      continue;
    }
    const serverId = randomUUID();
    rows.teacherProfiles.push({
      id: serverId,
      userId,
      managerId: mapUser(profile.managerId),
      headline: profile.headline,
      specializations: profile.specializations,
      languages: profile.languages,
      bio: profile.bio,
      hireDate: profile.hireDate,
      weeklyGoalHours: profile.weeklyGoalHours,
    });
    createdProfile("teacherProfiles", serverId);
  }

  for (const profile of Object.values(source.studentProfiles)) {
    if (isExcluded("studentProfiles", profile.id)) continue;
    const userId = mapUser(profile.userId);
    if (!userId) {
      drop("studentProfiles", profile.id, "The student's user record was not imported.");
      continue;
    }
    if (existing.studentProfileUserIds.has(userId)) {
      counts.studentProfiles.adopted += 1;
      continue;
    }
    const serverId = randomUUID();
    const guardian = profile.guardian ?? null;
    rows.studentProfiles.push({
      id: serverId,
      userId,
      managerId: mapUser(profile.managerId),
      level: profile.level,
      targetLevel: profile.targetLevel,
      goal: profile.goal,
      guardianName: guardian?.name || null,
      guardianEmail: guardian?.email || null,
      guardianPhone: guardian?.phone ?? null,
      guardianRelationship: guardian?.relationship ?? null,
    });
    createdProfile("studentProfiles", serverId);
  }

  // 3. Curriculum: courses -> units -> plans.
  for (const course of Object.values(source.courses)) {
    if (isExcluded("courses", course.id)) continue;
    const ownerId = mapUser(course.ownerId);
    if (!ownerId) {
      drop("courses", course.id, "The course owner was not imported.");
      continue;
    }
    const serverId = randomUUID();
    const createdAt = timestamp(course.createdAt);
    rows.courses.push({
      id: serverId,
      title: course.title,
      level: course.level,
      summary: course.summary,
      objectives: course.objectives,
      status: course.status,
      ownerId,
      createdAt,
      updatedAt: timestamp(course.updatedAt ?? course.createdAt),
    });
    created("courses", course.id, serverId);
  }

  for (const unit of Object.values(source.courseUnits)) {
    if (isExcluded("courseUnits", unit.id)) continue;
    const courseId = idMap[unit.courseId];
    if (!courseId) {
      drop("courseUnits", unit.id, "The unit's course was not imported.");
      continue;
    }
    const serverId = randomUUID();
    rows.courseUnits.push({
      id: serverId,
      courseId,
      order: unit.order,
      title: unit.title,
    });
    created("courseUnits", unit.id, serverId);
  }

  // 4. Attachments: adopt uploaded bytes; never register a row without bytes.
  for (const attachment of Object.values(source.attachments)) {
    if (isExcluded("attachments", attachment.id)) continue;
    const uploadedId = payload.attachments[attachment.id];
    if (uploadedId) {
      if (!existing.attachmentIds.has(uploadedId)) {
        drop("attachments", attachment.id, "The uploaded attachment id was not found on the server.");
        continue;
      }
      idMap[attachment.id] = uploadedId;
      counts.attachments.adopted += 1;
      continue;
    }
    if (existing.attachmentIds.has(attachment.id)) {
      idMap[attachment.id] = attachment.id;
      counts.attachments.adopted += 1;
      continue;
    }
    if (options.dryRun) {
      pendingUploads += 1;
      continue;
    }
    drop(
      "attachments",
      attachment.id,
      "No bytes were uploaded for this file, so it was skipped (a metadata-only row would 404 on download).",
      "missing-bytes",
    );
  }

  const mapAttachments = (ids: string[], planLocalId: string): string[] => {
    const mapped: string[] = [];
    for (const attachmentId of ids) {
      const serverId = idMap[attachmentId];
      if (serverId) mapped.push(serverId);
      else
        warn(
          "dropped-reference",
          "lessonPlans",
          planLocalId,
          `Attachment ${attachmentId} was not imported.`,
        );
    }
    return mapped;
  };

  for (const plan of Object.values(source.lessonPlans)) {
    if (isExcluded("lessonPlans", plan.id)) continue;
    const unitId = idMap[plan.unitId];
    if (!unitId) {
      drop("lessonPlans", plan.id, "The plan's unit was not imported.");
      continue;
    }
    const serverId = randomUUID();
    rows.lessonPlans.push({
      id: serverId,
      unitId,
      order: plan.order,
      title: plan.title,
      focus: plan.focus,
      summary: plan.summary,
      sections: plan.sections,
      attachmentIds: mapAttachments(plan.attachmentIds, plan.id),
      updatedAt: timestamp(plan.updatedAt),
    });
    created("lessonPlans", plan.id, serverId);
  }

  // 5. Enrollments, then lessons (the parent every history row hangs off).
  for (const enrollment of Object.values(source.enrollments)) {
    if (isExcluded("enrollments", enrollment.id)) continue;
    const studentId = mapUser(enrollment.studentId);
    const teacherId = mapUser(enrollment.teacherId);
    const courseId = idMap[enrollment.courseId];
    if (!studentId || !teacherId || !courseId) {
      drop("enrollments", enrollment.id, "The enrollment's student, teacher, or course was not imported.");
      continue;
    }
    const serverId = randomUUID();
    rows.enrollments.push({
      id: serverId,
      studentId,
      teacherId,
      courseId,
      nextPlanIndex: enrollment.nextPlanIndex,
      status: enrollment.status,
      startedAt: timestamp(enrollment.startedAt),
    });
    created("enrollments", enrollment.id, serverId);
  }

  for (const lesson of Object.values(source.lessons)) {
    if (isExcluded("lessons", lesson.id)) continue;
    const teacherId = mapUser(lesson.teacherId);
    const studentId = mapUser(lesson.studentId);
    if (!teacherId || !studentId) {
      drop("lessons", lesson.id, "The lesson's teacher or student was not imported.");
      continue;
    }
    const createdBy = mapUser(lesson.createdBy) ?? options.actorId;
    if (!mapUser(lesson.createdBy)) {
      warn("unknown-user", "lessons", lesson.id, "The lesson creator was not imported; the importing admin was recorded instead.");
    }
    const serverId = randomUUID();
    const createdAt = timestamp(lesson.createdAt);
    rows.lessons.push({
      id: serverId,
      enrollmentId: lesson.enrollmentId ? idMap[lesson.enrollmentId] ?? null : null,
      teacherId,
      studentId,
      date: lesson.date,
      time: lesson.time,
      endTime: lesson.endTime,
      title: lesson.title,
      focus: lesson.focus,
      status: lesson.status,
      roomCode: lesson.roomCode ?? null,
      lessonPlanId: lesson.lessonPlanId ? idMap[lesson.lessonPlanId] ?? null : null,
      planAttachedBy: mapUser(lesson.planAttachedBy),
      planAttachedAt: lesson.planAttachedAt ? timestamp(lesson.planAttachedAt) : null,
      notes: lesson.notes ?? null,
      homework: lesson.homework ?? null,
      attendance: lesson.attendance ?? null,
      feedback: lesson.feedback ?? null,
      scores: lesson.scores,
      corrections: lesson.corrections,
      cancelReason: lesson.cancelReason ?? null,
      createdBy,
      createdAt,
      updatedAt: createdAt,
    });
    created("lessons", lesson.id, serverId);
  }

  for (const slot of Object.values(source.slotOpenings)) {
    if (isExcluded("slotOpenings", slot.id)) continue;
    const teacherId = mapUser(slot.teacherId);
    if (!teacherId) {
      drop("slotOpenings", slot.id, "The slot's teacher was not imported.");
      continue;
    }
    const serverId = randomUUID();
    rows.slotOpenings.push({
      id: serverId,
      teacherId,
      date: slot.date,
      time: slot.time,
      openedAt: timestamp(slot.openedAt),
      openedBy: mapUser(slot.openedBy) ?? options.actorId,
    });
    created("slotOpenings", slot.id, serverId);
  }

  for (const request of Object.values(source.requests)) {
    if (isExcluded("requests", request.id)) continue;
    const teacherId = mapUser(request.teacherId);
    const requestedBy = mapUser(request.requestedBy);
    if (!teacherId || !requestedBy) {
      drop("requests", request.id, "The request's teacher or requester was not imported.");
      continue;
    }
    const lessonId = request.lessonId ? idMap[request.lessonId] : null;
    if (request.type === "lesson-cancellation" && !lessonId) {
      drop("requests", request.id, "The cancelled lesson was not imported, so its request was skipped too.");
      continue;
    }
    const serverId = randomUUID();
    rows.requests.push({
      id: serverId,
      type: request.type,
      teacherId,
      date: request.type === "slot-closure" ? request.date ?? null : null,
      time: request.type === "slot-closure" ? request.time ?? null : null,
      lessonId: lessonId ?? null,
      reason: request.reason,
      comment: request.comment ?? null,
      attachmentId: request.attachmentId ? idMap[request.attachmentId] ?? null : null,
      status: request.status,
      requestedAt: timestamp(request.requestedAt),
      requestedBy,
      reviewedBy: mapUser(request.reviewedBy),
      reviewedAt: request.reviewedAt ? timestamp(request.reviewedAt) : null,
      reviewNote: request.reviewNote ?? null,
    });
    created("requests", request.id, serverId);
  }

  for (const absence of Object.values(source.absences)) {
    if (isExcluded("absences", absence.id)) continue;
    const lessonId = idMap[absence.lessonId];
    const teacherId = mapUser(absence.teacherId);
    const reportedBy = mapUser(absence.reportedBy);
    if (!lessonId || !teacherId || !reportedBy) {
      drop("absences", absence.id, "The absence's lesson, teacher, or reporter was not imported.");
      continue;
    }
    const serverId = randomUUID();
    rows.absences.push({
      id: serverId,
      lessonId,
      teacherId,
      note: absence.note,
      reportedBy,
      reportedAt: timestamp(absence.reportedAt),
    });
    created("absences", absence.id, serverId);
  }

  for (const rating of Object.values(source.ratings)) {
    if (isExcluded("ratings", rating.id)) continue;
    const lessonId = idMap[rating.lessonId];
    const teacherId = mapUser(rating.teacherId);
    const studentId = mapUser(rating.studentId);
    if (!lessonId || !teacherId || !studentId) {
      drop("ratings", rating.id, "The rating's lesson, teacher, or student was not imported.");
      continue;
    }
    const serverId = randomUUID();
    rows.ratings.push({
      id: serverId,
      lessonId,
      teacherId,
      studentId,
      from: rating.from,
      authorId: mapUser(rating.authorId),
      authorName: rating.authorName,
      score: rating.score,
      comment: rating.comment ?? null,
      createdAt: timestamp(rating.createdAt),
    });
    created("ratings", rating.id, serverId);
  }

  for (const assignment of Object.values(source.assignments)) {
    if (isExcluded("assignments", assignment.id)) continue;
    const studentId = mapUser(assignment.studentId);
    const teacherId = mapUser(assignment.teacherId);
    if (!studentId || !teacherId) {
      drop("assignments", assignment.id, "The assignment's student or teacher was not imported.");
      continue;
    }
    const serverId = randomUUID();
    rows.assignments.push({
      id: serverId,
      studentId,
      teacherId,
      title: assignment.title,
      type: assignment.type,
      description: assignment.description,
      instructions: assignment.instructions,
      dueLabel: assignment.dueLabel,
      status: assignment.status,
      response: assignment.response ?? null,
      submittedAt: assignment.submittedAt ? timestamp(assignment.submittedAt) : null,
      feedback: assignment.feedback ?? null,
      grade: assignment.grade ?? null,
      reviewedAt: assignment.reviewedAt ? timestamp(assignment.reviewedAt) : null,
      createdAt: timestamp(assignment.createdAt),
    });
    created("assignments", assignment.id, serverId);
  }

  for (const credit of Object.values(source.credits)) {
    if (isExcluded("credits", credit.id)) continue;
    const studentId = mapUser(credit.studentId);
    const actorId = mapUser(credit.actorId);
    if (!studentId || !actorId) {
      drop("credits", credit.id, "The credit entry's student or actor was not imported.");
      continue;
    }
    const serverId = randomUUID();
    rows.credits.push({
      id: serverId,
      studentId,
      hours: credit.hours,
      amount: credit.amount ?? null,
      reason: credit.reason,
      description: credit.description,
      lessonId: credit.lessonId ? idMap[credit.lessonId] ?? null : null,
      actorId,
      createdAt: timestamp(credit.createdAt),
    });
    created("credits", credit.id, serverId);
  }

  for (const entry of Object.values(source.activity)) {
    if (isExcluded("activity", entry.id)) continue;
    const serverId = randomUUID();
    rows.activity.push({
      id: serverId,
      actorId: mapUser(entry.actorId) ?? options.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: idMap[entry.targetId] ?? entry.targetId,
      summary: entry.summary,
      createdAt: timestamp(entry.createdAt),
    });
    created("activity", entry.id, serverId);
  }

  const settingsRow: (typeof settings.$inferInsert) | null = payload.options.importSettings
    ? {
        id: 1,
        schoolName: payload.source.settings.schoolName,
        onTheSpotCancellationHours: payload.source.settings.onTheSpotCancellationHours,
        performanceWindowDays: payload.source.settings.performanceWindowDays,
        bookingDayStart: payload.source.settings.bookingDayStart,
        bookingDayEnd: payload.source.settings.bookingDayEnd,
        studentLateCancellationHours: payload.source.settings.studentLateCancellationHours,
        refundTeacherCancellations: payload.source.settings.refundTeacherCancellations,
      }
    : null;

  const totals = Object.values(counts).reduce(
    (sum, count) => ({
      created: sum.created + count.created,
      adopted: sum.adopted + count.adopted,
      dropped: sum.dropped + count.dropped,
      skippedSeed: sum.skippedSeed + count.skippedSeed,
    }),
    { created: 0, adopted: 0, dropped: 0, skippedSeed: 0 },
  );

  return {
    marker: payload.source.seededAt,
    rows,
    settings: settingsRow,
    idMap,
    createdIds,
    counts,
    warnings,
    warningsTruncated: warnings.length >= WARNING_LIMIT,
    pendingUploads,
    totals,
  };
}

/** Write a planned import. Call inside `app.db.transaction` so a failure leaves nothing behind. */
export async function applyImportPlan(tx: DbOrTx, plan: ImportPlan): Promise<void> {
  const rows = plan.rows;
  if (rows.users.length) await tx.insert(users).values(rows.users);
  if (rows.teacherProfiles.length) await tx.insert(teacherProfiles).values(rows.teacherProfiles);
  if (rows.studentProfiles.length) await tx.insert(studentProfiles).values(rows.studentProfiles);
  if (rows.courses.length) await tx.insert(courses).values(rows.courses);
  if (rows.courseUnits.length) await tx.insert(courseUnits).values(rows.courseUnits);
  if (rows.lessonPlans.length) await tx.insert(lessonPlans).values(rows.lessonPlans);
  if (rows.enrollments.length) await tx.insert(enrollments).values(rows.enrollments);
  if (rows.lessons.length) await tx.insert(lessons).values(rows.lessons);
  if (rows.slotOpenings.length) await tx.insert(slotOpenings).values(rows.slotOpenings);
  if (rows.requests.length) await tx.insert(requests).values(rows.requests);
  if (rows.absences.length) await tx.insert(absences).values(rows.absences);
  if (rows.ratings.length) await tx.insert(ratings).values(rows.ratings);
  if (rows.assignments.length) await tx.insert(assignments).values(rows.assignments);
  if (rows.credits.length) await tx.insert(creditEntries).values(rows.credits);
  if (rows.activity.length) await tx.insert(activity).values(rows.activity);

  if (plan.settings) {
    await tx
      .insert(settings)
      .values(plan.settings)
      .onConflictDoUpdate({
        target: settings.id,
        set: {
          schoolName: plan.settings.schoolName,
          onTheSpotCancellationHours: plan.settings.onTheSpotCancellationHours,
          performanceWindowDays: plan.settings.performanceWindowDays,
          bookingDayStart: plan.settings.bookingDayStart,
          bookingDayEnd: plan.settings.bookingDayEnd,
          studentLateCancellationHours: plan.settings.studentLateCancellationHours,
          refundTeacherCancellations: plan.settings.refundTeacherCancellations,
        },
      });
  }
}

/** Load the server rows the planner needs to decide adopt vs. create. */
export async function loadExistingSchool(db: DbOrTx): Promise<ExistingSchool> {
  const [userRows, teacherRows, studentRows, attachmentRows] = await Promise.all([
    db.select({ id: users.id, email: users.email }).from(users),
    db.select({ userId: teacherProfiles.userId }).from(teacherProfiles),
    db.select({ userId: studentProfiles.userId }).from(studentProfiles),
    db.select({ id: attachments.id }).from(attachments),
  ]);

  return {
    userIdByEmail: new Map(userRows.map((row) => [row.email.toLowerCase(), row.id])),
    teacherProfileUserIds: new Set(teacherRows.map((row) => row.userId)),
    studentProfileUserIds: new Set(studentRows.map((row) => row.userId)),
    attachmentIds: new Set(attachmentRows.map((row) => row.id)),
  };
}

/** True when this browser store was already imported (the marker is an activity row). */
export async function findImportMarker(db: DbOrTx, marker: string): Promise<boolean> {
  const [row] = await db
    .select({ id: activity.id })
    .from(activity)
    .where(and(eq(activity.action, "school.imported"), eq(activity.targetId, marker)))
    .limit(1);
  return Boolean(row);
}
