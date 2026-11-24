import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const schoolRole = pgEnum("school_role", [
  "admin",
  "manager",
  "teacher",
  "student",
]);
export const userStatus = pgEnum("user_status", [
  "active",
  "paused",
  "archived",
  "invited",
]);
export const courseStatus = pgEnum("course_status", [
  "draft",
  "published",
  "archived",
]);
export const enrollmentStatus = pgEnum("enrollment_status", [
  "active",
  "paused",
  "completed",
  "ended",
]);
export const lessonStatus = pgEnum("lesson_status", [
  "scheduled",
  "live",
  "completed",
  "cancelled",
]);
export const lessonAttendance = pgEnum("lesson_attendance", [
  "attended",
  "no-show",
]);
export const requestStatus = pgEnum("request_status", [
  "pending",
  "approved",
  "rejected",
]);
export const requestType = pgEnum("request_type", [
  "slot-closure",
  "lesson-cancellation",
]);
export const ratingSource = pgEnum("rating_source", ["student", "parent"]);
export const assignmentState = pgEnum("assignment_state", [
  "assigned",
  "submitted",
  "reviewed",
]);
export const homeworkType = pgEnum("homework_type", [
  "recording",
  "quiz",
  "reading",
  "writing",
]);
export const creditReason = pgEnum("credit_reason", [
  "purchase",
  "booking",
  "refund",
  "adjustment",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: schoolRole("role").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    status: userStatus("status").default("active").notNull(),
    avatarColor: text("avatar_color").default("#6366f1").notNull(),
    ...timestamps,
  },
  (table) => [index("users_role_idx").on(table.role)],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("refresh_tokens_user_idx").on(table.userId)],
);

/**
 * Single-use account tokens. Only the sha256 hex of the raw token is stored.
 * `invite` is issued today; `reset` is reserved for a future self-service flow.
 */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    purpose: text("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("auth_tokens_user_idx").on(table.userId),
    check(
      "auth_tokens_purpose_check",
      sql`${table.purpose} in ('invite', 'reset')`,
    ),
  ],
);

export const teacherProfiles = pgTable("teacher_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  managerId: uuid("manager_id").references(() => users.id, {
    onDelete: "set null",
  }),
  headline: text("headline").default("").notNull(),
  specializations: text("specializations")
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),
  languages: text("languages")
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),
  bio: text("bio").default("").notNull(),
  hireDate: date("hire_date").notNull(),
  weeklyGoalHours: integer("weekly_goal_hours").default(0).notNull(),
});

export const studentProfiles = pgTable("student_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  managerId: uuid("manager_id").references(() => users.id, {
    onDelete: "set null",
  }),
  level: text("level").default("beginner").notNull(),
  targetLevel: text("target_level").default("intermediate").notNull(),
  goal: text("goal").default("").notNull(),
  guardianName: text("guardian_name"),
  guardianEmail: text("guardian_email"),
  guardianPhone: text("guardian_phone"),
  guardianRelationship: text("guardian_relationship"),
});

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    level: text("level").notNull(),
    summary: text("summary").default("").notNull(),
    objectives: text("objectives")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    status: courseStatus("status").default("draft").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [index("courses_status_idx").on(table.status)],
);

export const courseUnits = pgTable(
  "course_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    title: text("title").notNull(),
  },
  (table) => [index("course_units_course_idx").on(table.courseId)],
);

export type LessonPlanSection = {
  heading: string;
  items: string[];
};

export const lessonPlans = pgTable(
  "lesson_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => courseUnits.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    title: text("title").notNull(),
    focus: text("focus")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    summary: text("summary").default("").notNull(),
    sections: jsonb("sections")
      .$type<LessonPlanSection[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    attachmentIds: uuid("attachment_ids")
      .array()
      .default(sql`'{}'::uuid[]`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("lesson_plans_unit_idx").on(table.unitId)],
);

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  size: integer("size").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Curriculum Library: one global, school-wide set of reusable materials. One file per item
 * (`attachment_id` unique); archive-only (`status` published | archived, zod and CHECK-enforced).
 */
export const libraryItems = pgTable("library_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  level: text("level"),
  description: text("description"),
  tags: text("tags")
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),
  attachmentId: uuid("attachment_id")
    .notNull()
    .unique()
    .references(() => attachments.id, { onDelete: "restrict" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  status: text("status").default("published").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  check(
    "library_items_status_check",
    sql`${table.status} in ('published', 'archived')`,
  ),
]);

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    nextPlanIndex: integer("next_plan_index").default(0).notNull(),
    status: enrollmentStatus("status").default("active").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("enrollments_student_idx").on(table.studentId),
    index("enrollments_teacher_idx").on(table.teacherId),
  ],
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id, {
      onDelete: "set null",
    }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    time: text("time").notNull(),
    endTime: text("end_time").notNull(),
    title: text("title").notNull(),
    focus: text("focus")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    status: lessonStatus("status").default("scheduled").notNull(),
    roomCode: text("room_code"),
    lessonPlanId: uuid("lesson_plan_id").references(() => lessonPlans.id, {
      onDelete: "set null",
    }),
    planAttachedBy: uuid("plan_attached_by").references(() => users.id, {
      onDelete: "set null",
    }),
    planAttachedAt: timestamp("plan_attached_at", { withTimezone: true }),
    notes: text("notes"),
    homework: text("homework"),
    attendance: lessonAttendance("attendance"),
    feedback: text("feedback"),
    scores: jsonb("scores")
      .$type<{ label: string; value: number }[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    corrections: jsonb("corrections")
      .$type<{ from: string; to: string }[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("lessons_teacher_date_idx").on(table.teacherId, table.date),
    index("lessons_student_date_idx").on(table.studentId, table.date),
    // One active lesson per teacher/date/start-time. Cancelled and completed rows stay
    // historical and must not block reuse of the same key.
    uniqueIndex("lessons_active_teacher_date_time_uidx")
      .on(table.teacherId, table.date, table.time)
      .where(sql`${table.status} in ('scheduled', 'live')`),
  ],
);

/** Library items linked to a lesson. No id column; the API derives `{lessonId}:{libraryItemId}`. */
export const lessonLibraryItems = pgTable(
  "lesson_library_items",
  {
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    libraryItemId: uuid("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "restrict" }),
    attachedBy: uuid("attached_by")
      .notNull()
      .references(() => users.id),
    attachedAt: timestamp("attached_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.lessonId, table.libraryItemId] }),
    index("lesson_library_items_item_idx").on(table.libraryItemId),
  ],
);

export const slotOpenings = pgTable(
  "slot_openings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    time: text("time").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    openedBy: uuid("opened_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("slot_openings_teacher_date_time_idx").on(
      table.teacherId,
      table.date,
      table.time,
    ),
  ],
);

export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: requestType("type").notNull(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date"),
    time: text("time"),
    lessonId: uuid("lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    comment: text("comment"),
    attachmentId: uuid("attachment_id").references(() => attachments.id, {
      onDelete: "set null",
    }),
    status: requestStatus("status").default("pending").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
  },
  (table) => [index("requests_teacher_idx").on(table.teacherId)],
);

export const absences = pgTable("absences", {
  id: uuid("id").primaryKey().defaultRandom(),
  lessonId: uuid("lesson_id")
    .notNull()
    .unique()
    .references(() => lessons.id, { onDelete: "cascade" }),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  reportedBy: uuid("reported_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reportedAt: timestamp("reported_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    from: ratingSource("from").default("student").notNull(),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    authorName: text("author_name").notNull(),
    score: integer("score").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("ratings_teacher_idx").on(table.teacherId)],
);

export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: homeworkType("type").notNull(),
    description: text("description").default("").notNull(),
    instructions: text("instructions").default("").notNull(),
    dueLabel: text("due_label").notNull(),
    status: assignmentState("status").default("assigned").notNull(),
    response: text("response"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    feedback: text("feedback"),
    grade: text("grade"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("assignments_student_idx").on(table.studentId),
    index("assignments_teacher_idx").on(table.teacherId),
  ],
);

export const creditEntries = pgTable(
  "credit_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hours: numeric("hours").$type<number>().notNull(),
    amount: integer("amount"),
    reason: creditReason("reason").notNull(),
    description: text("description").notNull(),
    lessonId: uuid("lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("credit_entries_student_idx").on(table.studentId)],
);

export const activity = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("activity_actor_idx").on(table.actorId)],
);

/** Per-user bell state. Notification content is derived (feed + role rules); only state is stored. */
export const notificationState = pgTable("notification_state", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  mutedCategories: text("muted_categories")
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),
  readIds: text("read_ids")
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  schoolName: text("school_name").default("Lumina ESL").notNull(),
  onTheSpotCancellationHours: integer("on_the_spot_cancellation_hours")
    .default(12)
    .notNull(),
  performanceWindowDays: integer("performance_window_days")
    .default(30)
    .notNull(),
  bookingDayStart: text("booking_day_start").default("08:00").notNull(),
  bookingDayEnd: text("booking_day_end").default("22:00").notNull(),
  studentLateCancellationHours: integer("student_late_cancellation_hours")
    .default(24)
    .notNull(),
  refundTeacherCancellations: boolean("refund_teacher_cancellations")
    .default(true)
    .notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuthToken = typeof authTokens.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type CreditEntry = typeof creditEntries.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type LibraryItem = typeof libraryItems.$inferSelect;
export type LessonLibraryItem = typeof lessonLibraryItems.$inferSelect;
