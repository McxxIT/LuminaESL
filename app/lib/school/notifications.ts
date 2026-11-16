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
import type { SchoolData, SchoolUser } from "./types";
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
};

const LOW_CREDIT_HOURS = (25 / 60) * 2; // fewer than two lessons left

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
  if (missing.length) items.push({ id: `plans-${missing.map((lesson) => lesson.id).join(",")}`, category: "plans", icon: "file", title: `${missing.length} lesson${missing.length === 1 ? "" : "s"} without a plan`, detail: missing.slice(0, 2).map((lesson) => `${lesson.title} (${shortWhen(lesson.date, lesson.time)})`).join(", "), nav: "Schedule", at: new Date().toISOString() });
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
