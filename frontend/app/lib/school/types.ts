/**
 * Shared school domain: the single source of truth that admin, manager, teacher, and student
 * screens all read from. Records reference each other by id, never by display name.
 * See ADMIN_PLAN.md section 4.
 */

/** Bump when the stored shape changes and add a migration in `store.ts` `upgrade()`. */
export const SCHOOL_SCHEMA_VERSION = 3;

/** YYYY-MM-DD */
export type ISODate = string;
/** HH:MM, 24-hour */
export type ClockTime = string;
/** Full ISO timestamp */
export type Timestamp = string;

export type SchoolRole = "admin" | "manager" | "teacher" | "student";
export type UserStatus = "active" | "paused" | "archived";

export type SchoolUser = {
  id: string;
  role: SchoolRole;
  name: string;
  email: string;
  status: UserStatus;
  avatarColor: string;
  createdAt: Timestamp;
};

/** Keyed by the teacher's user id (`id === userId`). `managerId` is how teachers belong to a manager. */
export type TeacherProfileRecord = {
  id: string;
  userId: string;
  managerId: string | null;
  headline: string;
  specializations: string[];
  languages: string[];
  bio: string;
  hireDate: ISODate;
  weeklyGoalHours: number;
};

export type Guardian = {
  name: string;
  email: string;
  phone?: string;
  relationship?: string;
};

/** Keyed by the student's user id (`id === userId`). */
export type StudentProfileRecord = {
  id: string;
  userId: string;
  managerId: string | null;
  level: string;
  targetLevel: string;
  goal: string;
  guardian?: Guardian;
};

export type CourseStatus = "draft" | "published" | "archived";

/** Curriculum: a course made of ordered units, each with ordered 25-minute lesson plans. */
export type Course = {
  id: string;
  title: string;
  level: string;
  summary: string;
  objectives: string[];
  status: CourseStatus;
  ownerId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type CourseUnit = {
  id: string;
  courseId: string;
  order: number;
  title: string;
};

export type LessonPlanSection = {
  heading: string;
  items: string[];
};

/** What teachers download as "lesson material" and students see as "prepare before class". */
export type LessonPlan = {
  id: string;
  unitId: string;
  order: number;
  title: string;
  focus: string[];
  summary: string;
  sections: LessonPlanSection[];
  attachmentIds: string[];
  updatedAt: Timestamp;
};

/** File metadata only. Bytes live outside the JSON store (IndexedDB) under `storageKey`. */
export type AttachmentMeta = {
  id: string;
  name: string;
  type: string;
  size: number;
  storageKey: string;
  uploadedBy: string;
  uploadedAt: Timestamp;
};

/** `ended` = replaced by a new enrollment (e.g. the student changed teacher). */
export type EnrollmentStatus = "active" | "paused" | "completed" | "ended";

/** The "class": one student + one teacher + one course. `nextPlanIndex` picks the next lesson plan. */
export type Enrollment = {
  id: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  nextPlanIndex: number;
  status: EnrollmentStatus;
  startedAt: Timestamp;
};

export type LessonStatus = "scheduled" | "live" | "completed" | "cancelled";
export type LessonAttendance = "attended" | "no-show";

/** One record per real lesson, shown to the student, teacher, and manager. Always 25 minutes. */
export type Lesson = {
  id: string;
  enrollmentId?: string;
  teacherId: string;
  studentId: string;
  date: ISODate;
  time: ClockTime;
  endTime: ClockTime;
  title: string;
  focus: string[];
  status: LessonStatus;
  roomCode?: string;
  lessonPlanId?: string;
  planAttachedBy?: string;
  planAttachedAt?: Timestamp;
  notes?: string;
  homework?: string;
  attendance?: LessonAttendance;
  feedback?: string;
  scores?: { label: string; value: number }[];
  corrections?: { from: string; to: string }[];
  cancelReason?: string;
  createdBy: string;
  createdAt: Timestamp;
};

export type SlotOpening = {
  id: string;
  teacherId: string;
  date: ISODate;
  time: ClockTime;
  openedAt: Timestamp;
  openedBy: string;
};

export type RequestStatus = "pending" | "approved" | "rejected";

type RequestBase = {
  id: string;
  teacherId: string;
  reason: string;
  comment?: string;
  attachmentId?: string;
  status: RequestStatus;
  requestedAt: Timestamp;
  requestedBy: string;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  reviewNote?: string;
};

/** An approved slot-closure request is what makes a slot "closed". */
export type SlotClosureRequest = RequestBase & {
  type: "slot-closure";
  date: ISODate;
  time: ClockTime;
};

export type LessonCancellationRequest = RequestBase & {
  type: "lesson-cancellation";
  lessonId: string;
};

/** Everything a teacher asks their manager to approve. Routed by the teacher's `managerId`. */
export type SchoolRequest = SlotClosureRequest | LessonCancellationRequest;
export type SchoolRequestType = SchoolRequest["type"];

/** Recorded by a manager when the teacher missed a lesson the student attended. */
export type TeacherAbsence = {
  id: string;
  lessonId: string;
  teacherId: string;
  note: string;
  reportedBy: string;
  reportedAt: Timestamp;
};

export type RatingSource = "student" | "parent";
export type RatingScore = 1 | 2 | 3 | 4 | 5;

export type Rating = {
  id: string;
  lessonId: string;
  teacherId: string;
  studentId: string;
  from: RatingSource;
  /** Set when the author has a user record (students). Parents rate through the student account. */
  authorId?: string;
  authorName: string;
  score: RatingScore;
  comment?: string;
  createdAt: Timestamp;
};

export type AssignmentState = "assigned" | "submitted" | "reviewed";
export type HomeworkType = "recording" | "quiz" | "reading" | "writing";

/** Homework a teacher sets for a student; the student submits, the teacher reviews. */
export type Assignment = {
  id: string;
  studentId: string;
  teacherId: string;
  title: string;
  type: HomeworkType;
  description: string;
  instructions: string;
  dueLabel: string;
  status: AssignmentState;
  response?: string;
  submittedAt?: Timestamp;
  feedback?: string;
  grade?: string;
  reviewedAt?: Timestamp;
  createdAt: Timestamp;
};

export type CreditReason = "purchase" | "booking" | "refund" | "adjustment";

/** Student credit balance is the sum of `hours` across their entries. */
export type CreditLedgerEntry = {
  id: string;
  studentId: string;
  hours: number;
  amount?: number;
  reason: CreditReason;
  description: string;
  lessonId?: string;
  actorId: string;
  createdAt: Timestamp;
};

/** Audit trail and the future source of notifications. */
export type ActivityEntry = {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: Timestamp;
};

/** Admin-editable rules that replace hard-coded constants (see ADMIN_PLAN.md section 6.2). */
export type SchoolSettings = {
  schoolName: string;
  onTheSpotCancellationHours: number;
  performanceWindowDays: number;
  bookingDayStart: ClockTime;
  bookingDayEnd: ClockTime;
  /** Students cancelling closer than this many hours to the start are not refunded. */
  studentLateCancellationHours: number;
  /** Refund the student when the teacher cancels or is absent. */
  refundTeacherCancellations: boolean;
};

export type SchoolCollections = {
  users: Record<string, SchoolUser>;
  teacherProfiles: Record<string, TeacherProfileRecord>;
  studentProfiles: Record<string, StudentProfileRecord>;
  courses: Record<string, Course>;
  courseUnits: Record<string, CourseUnit>;
  lessonPlans: Record<string, LessonPlan>;
  attachments: Record<string, AttachmentMeta>;
  enrollments: Record<string, Enrollment>;
  lessons: Record<string, Lesson>;
  slotOpenings: Record<string, SlotOpening>;
  requests: Record<string, SchoolRequest>;
  absences: Record<string, TeacherAbsence>;
  ratings: Record<string, Rating>;
  assignments: Record<string, Assignment>;
  credits: Record<string, CreditLedgerEntry>;
  activity: Record<string, ActivityEntry>;
};

export type CollectionName = keyof SchoolCollections;
export type EntityOf<C extends CollectionName> = SchoolCollections[C][string];

export type SchoolData = {
  version: number;
  /** Empty string means "not loaded yet" (server render / before hydration). */
  seededAt: Timestamp;
  migratedAt?: Timestamp;
  settings: SchoolSettings;
  collections: SchoolCollections;
};
