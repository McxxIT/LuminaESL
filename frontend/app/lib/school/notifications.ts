import { slotStartDate } from "../scheduling";
import { isoDaysFromNow } from "../student";
import { get, list, query } from "./repositories";
import {
  assignmentsForStudent,
  assignmentsForTeacher,
  creditBalance,
  lessonPlanForLesson,
  lessonsForStudent,
  lessonsForTeacher,
  lessonsForUser,
  pendingRequestsForUser,
  ratingsForLesson,
  studentsForUser,
  teachersForUser,
} from "./selectors";
import type { ActivityEntry, SchoolData, SchoolUser } from "./types";
import { nameOf } from "./views";

/**
 * In-app notifications built from shared data, so each role sees what actually needs attention.
 * Ids are stable, so "read" state can be remembered per account.
 */

export type NotificationCategory = "approvals" | "credits" | "plans" | "quality" | "lessons" | "requests" | "homework" | "feedback";
export type NotificationIcon = "check" | "wallet" | "file" | "star" | "calendar" | "bell" | "book" | "message" | "x";

export type SchoolNotification = {
  id: string;
  category: NotificationCategory;
  icon: NotificationIcon;
  title: string;
  detail: string;
  /** Page to open when clicked. */
  nav: string;
  /** For ordering (newest / most urgent first). */
  at: string;
  /** Internal dedupe key (`targetType:targetId`), not rendered. */
  targetKey?: string;
};

const LOW_CREDIT_HOURS = 2; // fewer than two lessons left (1 credit per lesson)

function shortWhen(date: string, time: string) {
  const today = isoDaysFromNow(0);
  const tomorrow = isoDaysFromNow(1);
  const day = date === today ? "Today" : date === tomorrow ? "Tomorrow" : new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${day} at ${time}`;
}

function since(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function forManager(data: SchoolData, user: SchoolUser): SchoolNotification[] {
  const items: SchoolNotification[] = [];
  pendingRequestsForUser(data, user).forEach((request) => {
    const teacher = nameOf(data, request.teacherId, "A teacher");
    items.push(request.type === "slot-closure"
      ? { id: `req-${request.id}`, category: "approvals", icon: "check", title: "Slot closure to review", detail: `${teacher} · ${shortWhen(request.date, request.time)} · ${request.reason}`, nav: "Approvals", at: request.requestedAt }
      : { id: `req-${request.id}`, category: "approvals", icon: "check", title: "Cancellation to review", detail: `${teacher} · ${get(data, "lessons", request.lessonId)?.title ?? "Lesson"} · ${request.reason}`, nav: "Approvals", at: request.requestedAt });
  });
  studentsForUser(data, user).filter((student) => student.status === "active").forEach((student) => {
    const balance = creditBalance(data, student.id);
    if (balance < LOW_CREDIT_HOURS) items.push({ id: `credits-${student.id}-${balance.toFixed(2)}`, category: "credits", icon: "wallet", title: "Low credits", detail: `${student.name} has ${balance.toFixed(1)} hours left`, nav: "Students", at: new Date().toISOString() });
  });
  const weekEnd = isoDaysFromNow(7);
  const missing = lessonsForUser(data, user).filter((lesson) => lesson.status === "scheduled" && lesson.date >= isoDaysFromNow(0) && lesson.date <= weekEnd && !lessonPlanForLesson(data, lesson));
  // Bounded id: it is persisted in the bell read state, so never embed the full lesson list.
  if (missing.length) items.push({ id: `plans-${missing.length}-${missing[0].date}-${missing[missing.length - 1].date}`, category: "plans", icon: "file", title: `${missing.length} lesson${missing.length === 1 ? "" : "s"} without a plan`, detail: missing.slice(0, 2).map((lesson) => `${lesson.title} (${shortWhen(lesson.date, lesson.time)})`).join(", "), nav: "Schedule", at: new Date().toISOString() });
  const teacherIds = new Set(teachersForUser(data, user).map((teacher) => teacher.id));
  query(data, "ratings", (rating) => teacherIds.has(rating.teacherId) && rating.score <= 2 && rating.createdAt >= since(7)).forEach((rating) => {
    items.push({ id: `rating-${rating.id}`, category: "quality", icon: "star", title: `${rating.score}-star rating`, detail: `${nameOf(data, rating.teacherId)} · ${rating.authorName}${rating.comment ? `: "${rating.comment}"` : ""}`, nav: "Performance", at: rating.createdAt });
  });
  return items;
}

function forTeacher(data: SchoolData, user: SchoolUser): SchoolNotification[] {
  const items: SchoolNotification[] = [];
  const now = Date.now();
  const lessons = lessonsForTeacher(data, user.id);
  const next = lessons.find((lesson) => (lesson.status === "scheduled" || lesson.status === "live") && slotStartDate(lesson.date, lesson.time).getTime() > now - 25 * 60_000);
  if (next) items.push({ id: `next-${next.id}`, category: "lessons", icon: "calendar", title: "Next lesson", detail: `${next.title} with ${nameOf(data, next.studentId)} · ${shortWhen(next.date, next.time)}`, nav: "Lessons", at: new Date().toISOString() });
  lessons.filter((lesson) => lesson.createdBy !== user.id && lesson.createdAt >= since(3) && lesson.status === "scheduled").forEach((lesson) => {
    items.push({ id: `booked-${lesson.id}`, category: "lessons", icon: "calendar", title: "New booking", detail: `${nameOf(data, lesson.studentId)} · ${lesson.title} · ${shortWhen(lesson.date, lesson.time)}`, nav: "Lessons", at: lesson.createdAt });
  });
  query(data, "requests", (request) => request.teacherId === user.id && request.status !== "pending" && Boolean(request.reviewedAt) && request.reviewedAt! >= since(7)).forEach((request) => {
    const approved = request.status === "approved";
    const what = request.type === "slot-closure" ? `slot ${shortWhen(request.date, request.time)}` : get(data, "lessons", request.lessonId)?.title ?? "lesson";
    items.push({ id: `reviewed-${request.id}`, category: "requests", icon: approved ? "check" : "x", title: `${request.type === "slot-closure" ? "Closure" : "Cancellation"} ${approved ? "approved" : "declined"}`, detail: `${what}${request.reviewNote ? ` · "${request.reviewNote}"` : ""}`, nav: request.type === "slot-closure" ? "Booking slots" : "Lessons", at: request.reviewedAt! });
  });
  assignmentsForTeacher(data, user.id).filter((assignment) => assignment.status === "submitted").forEach((assignment) => {
    items.push({ id: `hw-submitted-${assignment.id}`, category: "homework", icon: "book", title: "Homework to review", detail: `${nameOf(data, assignment.studentId)} · ${assignment.title}`, nav: "Students", at: assignment.submittedAt ?? assignment.createdAt });
  });
  query(data, "ratings", (rating) => rating.teacherId === user.id && rating.createdAt >= since(7)).forEach((rating) => {
    items.push({ id: `rating-${rating.id}`, category: "feedback", icon: "star", title: `New ${rating.score}-star rating`, detail: `${rating.authorName}${rating.comment ? `: "${rating.comment}"` : ""}`, nav: "Analytics", at: rating.createdAt });
  });
  return items;
}

function forStudent(data: SchoolData, user: SchoolUser): SchoolNotification[] {
  const items: SchoolNotification[] = [];
  const now = Date.now();
  const lessons = lessonsForStudent(data, user.id);
  const next = lessons.find((lesson) => lesson.status === "scheduled" && slotStartDate(lesson.date, lesson.time).getTime() > now);
  if (next) items.push({ id: `next-${next.id}`, category: "lessons", icon: "calendar", title: "Upcoming lesson", detail: `${next.title} with ${nameOf(data, next.teacherId)} · ${shortWhen(next.date, next.time)}`, nav: "Lessons", at: new Date().toISOString() });
  lessons.filter((lesson) => lesson.status === "completed" && lesson.feedback && lesson.date >= isoDaysFromNow(-7)).forEach((lesson) => {
    items.push({ id: `feedback-${lesson.id}`, category: "feedback", icon: "message", title: "New lesson feedback", detail: `${nameOf(data, lesson.teacherId)} · ${lesson.title}`, nav: "Lessons", at: `${lesson.date}T${lesson.endTime}:00` });
  });
  lessons.filter((lesson) => lesson.status === "completed" && lesson.attendance !== "no-show" && lesson.date >= isoDaysFromNow(-7) && !ratingsForLesson(data, lesson.id).some((rating) => rating.from === "student")).forEach((lesson) => {
    items.push({ id: `rate-${lesson.id}`, category: "feedback", icon: "star", title: "Rate your lesson", detail: `How was ${lesson.title} with ${nameOf(data, lesson.teacherId)}?`, nav: "Lessons", at: `${lesson.date}T${lesson.endTime}:00` });
  });
  lessons.filter((lesson) => lesson.status === "cancelled" && lesson.date >= isoDaysFromNow(-1) && list(data, "requests").some((request) => request.type === "lesson-cancellation" && request.lessonId === lesson.id && request.status === "approved")).forEach((lesson) => {
    items.push({ id: `cancelled-${lesson.id}`, category: "lessons", icon: "x", title: "Lesson cancelled by your teacher", detail: `${lesson.title} · ${shortWhen(lesson.date, lesson.time)} · credit returned`, nav: "Lessons", at: `${lesson.date}T${lesson.time}:00` });
  });
  assignmentsForStudent(data, user.id).forEach((assignment) => {
    if (assignment.status === "assigned") items.push({ id: `hw-${assignment.id}`, category: "homework", icon: "book", title: "Homework to do", detail: `${assignment.title} · ${assignment.dueLabel}`, nav: "Assignments", at: assignment.createdAt });
    if (assignment.status === "reviewed" && (assignment.reviewedAt ?? "") >= since(7)) items.push({ id: `hw-reviewed-${assignment.id}`, category: "homework", icon: "check", title: "Homework reviewed", detail: `${assignment.title}${assignment.grade ? ` · ${assignment.grade}` : ""}`, nav: "Assignments", at: assignment.reviewedAt! });
  });
  const balance = creditBalance(data, user.id);
  if (balance < LOW_CREDIT_HOURS) items.push({ id: `credits-${balance.toFixed(2)}`, category: "credits", icon: "wallet", title: "Low credits", detail: `${balance.toFixed(1)} hours left. Top up to keep booking.`, nav: "Billing", at: new Date().toISOString() });
  return items;
}

/** Newest first. `muted` hides whole categories (manager/admin Settings). */
export function notificationsForUser(data: SchoolData, user: SchoolUser | undefined, muted: NotificationCategory[] = []): SchoolNotification[] {
  if (!user) return [];
  const items = user.role === "admin" || user.role === "manager" ? forManager(data, user) : user.role === "teacher" ? forTeacher(data, user) : forStudent(data, user);
  return items.filter((item) => !muted.includes(item.category)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
}

// Activity feed -> bell items ---------------------------------------------------------------

type UserRole = SchoolUser["role"];

const ACTION_TITLES: Record<string, string> = {
  "absence.recorded": "Teacher absence",
  "credits.adjusted": "Credits adjusted",
  "credits.purchased": "Credits purchased",
  "credits.refunded": "Credits refunded",
  "course.archived": "Course archived",
  "course.created": "Course created",
  "course.duplicated": "Course duplicated",
  "course.published": "Course published",
  "course.updated": "Course updated",
  "enrollment.created": "Enrollment created",
  "enrollment.updated": "Enrollment updated",
  "homework.assigned": "Homework assigned",
  "homework.reviewed": "Homework reviewed",
  "homework.submitted": "Homework submitted",
  "lesson.booked": "New booking",
  "lesson.cancelledByStudent": "Lesson cancelled",
  "lesson.completed": "Lesson completed",
  "lesson.planChanged": "Lesson plan changed",
  "lesson.rated": "New rating",
  "lesson.rescheduled": "Lesson rescheduled",
  "manager.created": "Manager added",
  "request.approved": "Request approved",
  "request.created": "New request",
  "request.rejected": "Request declined",
  "request.withdrawn": "Request withdrawn",
  "school.imported": "School imported",
  "slot.closed": "Slot closed",
  "slot.opened": "Slot opened",
  "student.created": "Student added",
  "student.reassigned": "Student reassigned",
  "student.updated": "Student updated",
  "teacher.created": "Teacher added",
  "teacher.reassigned": "Teacher reassigned",
  "teacher.updated": "Teacher updated",
  "user.archived": "Account archived",
  "user.created": "Account created",
  "user.password_changed": "Password changed",
  "user.password_reset": "Password reset",
  "user.inactive": "Account paused",
  "user.paused": "Account paused",
  "user.renamed": "Name updated",
  "user.updated": "Account updated",
};

const CATEGORY_ICONS: Partial<Record<NotificationCategory, NotificationIcon>> = {
  approvals: "check",
  credits: "wallet",
  plans: "file",
  quality: "star",
  lessons: "calendar",
  requests: "bell",
  homework: "book",
  feedback: "star",
};

function familyOf(action: string): string {
  return action.split(".")[0] ?? action;
}

function categoryOf(action: string): NotificationCategory {
  const family = familyOf(action);
  if (family === "request") return "approvals";
  if (family === "credits") return "credits";
  if (family === "homework") return "homework";
  if (family === "lesson" && action === "lesson.rated") return "feedback";
  if (family === "lesson" || family === "slot" || family === "absence") return "lessons";
  return "plans";
}

function navFor(action: string, role: UserRole): string {
  const family = familyOf(action);
  if (family === "request" || family === "absence") {
    return role === "admin" || role === "manager" ? "Approvals" : "Lessons";
  }
  if (family === "lesson") {
    return role === "admin" || role === "manager" ? "Schedule" : "Lessons";
  }
  if (family === "slot") {
    return role === "teacher" ? "Booking slots" : role === "student" ? "Lessons" : "Schedule";
  }
  if (family === "homework") return role === "student" ? "Assignments" : "Students";
  if (family === "credits") return role === "student" ? "Billing" : "Students";
  if (family === "rating") return role === "teacher" ? "Analytics" : "Performance";
  if (family === "course" || family === "enrollment") return role === "student" ? "Progress" : "Curriculum";
  if (family === "settings") return role === "admin" ? "School settings" : "Settings";
  if (family === "manager") return "Managers";
  if (family === "teacher") return role === "admin" || role === "manager" ? "Teachers" : "Students";
  if (family === "user" || family === "student") return role === "student" ? "Profile" : "Students";
  if (family === "school") return role === "admin" ? "Settings" : "Overview";
  return "Overview";
}

function prettify(action: string): string {
  const words = action.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Maps one activity row to a bell item. Titles stay generic; `summary` carries the detail. */
export function activityNotification(entry: ActivityEntry, role: UserRole): SchoolNotification {
  const category = categoryOf(entry.action);
  return {
    id: `act-${entry.id}`,
    category,
    icon: CATEGORY_ICONS[category] ?? "bell",
    title: ACTION_TITLES[entry.action] ?? prettify(entry.action),
    detail: entry.summary,
    nav: navFor(entry.action, role),
    at: entry.createdAt,
    targetKey: `${entry.targetType}:${entry.targetId}`,
  };
}

/** Derived ids that mirror a specific record, so activity rows for the same record do not repeat. */
const DERIVED_TARGETS: [prefix: string, targetType: string][] = [
  ["reviewed-", "request"],
  ["req-", "request"],
  ["next-", "lesson"],
  ["booked-", "lesson"],
  ["feedback-", "lesson"],
  ["rate-", "lesson"],
  ["cancelled-", "lesson"],
  ["rating-", "lesson"],
  ["hw-reviewed-", "assignment"],
  ["hw-", "assignment"],
  ["credits-", "user"],
];

function derivedTargetKey(id: string): string | undefined {
  for (const [prefix, targetType] of DERIVED_TARGETS) {
    if (id.startsWith(prefix)) return `${targetType}:${id.slice(prefix.length)}`;
  }
  return undefined;
}

/**
 * API mode: merge the activity feed with the role derivation. The derived item wins when both
 * describe the same record (it carries the richer copy); muted categories hide both sources.
 */
export function mergeNotifications(
  derived: SchoolNotification[],
  feed: SchoolNotification[],
  muted: NotificationCategory[] = [],
): SchoolNotification[] {
  const covered = new Set(derived.map((item) => item.targetKey ?? derivedTargetKey(item.id)).filter(Boolean));
  const merged = [...derived];

  for (const item of feed) {
    if (item.targetKey && covered.has(item.targetKey)) continue;
    merged.push(item);
  }

  return merged.filter((item) => !muted.includes(item.category)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
}
