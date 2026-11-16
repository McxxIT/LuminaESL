import { addMinutes, parseISODate, toISODate } from "./student";
import type { TeacherSlotClosure, TeacherSlotClosureStatus, TeacherSlotOpening } from "./types";

/**
 * Pure 25-minute slot math shared by every role. Reading and changing slot data happens in the
 * shared school store (`app/lib/school`), never here.
 */

export const LESSON_SLOT_MINUTES = 25;
export const SLOT_BREAK_MINUTES = 5;
export const SLOT_INTERVAL_MINUTES = LESSON_SLOT_MINUTES + SLOT_BREAK_MINUTES;
export const BOOKING_DAY_START = "08:00";
export const BOOKING_DAY_END = "23:30";

type SlotLesson = {
  id: string;
  date: string;
  time: string;
  endTime?: string;
  duration: number;
  status: string;
  title: string;
  studentId?: string;
  studentName?: string;
  studentInitials?: string;
  studentColor?: string;
  roomCode?: string;
};

export type DaySlotStatus = "open" | "pending" | "closed" | "booked";

export type DaySlot = {
  time: string;
  endTime: string;
  status: DaySlotStatus;
  lesson?: SlotLesson;
  closure?: TeacherSlotClosure;
  opening?: TeacherSlotOpening;
};

export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function slotTimesForWindow(startTime: string, endTime: string) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const result: string[] = [];
  for (let cursor = start; cursor <= end; cursor += SLOT_INTERVAL_MINUTES) {
    const hours = Math.floor(cursor / 60);
    const minutes = cursor % 60;
    result.push(`${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
  }
  return result;
}

export function bookingSlotTimes() {
  return slotTimesForWindow(BOOKING_DAY_START, BOOKING_DAY_END);
}

export function slotEnd(time: string) {
  return addMinutes(time, LESSON_SLOT_MINUTES);
}

function lessonBlocksSlot(lesson: SlotLesson, date: string, time: string) {
  if (lesson.date !== date || lesson.status === "cancelled") return false;
  const start = timeToMinutes(time);
  const end = start + LESSON_SLOT_MINUTES;
  const lessonStart = timeToMinutes(lesson.time);
  const lessonEnd = lessonStart + lesson.duration;
  return lessonStart < end && start < lessonEnd;
}

const closureRank: Record<TeacherSlotClosureStatus, number> = {
  approved: 3,
  pending: 2,
  rejected: 1,
};

function closureForSlot(closures: TeacherSlotClosure[], date: string, time: string) {
  const matches = closures.filter((closure) => closure.date === date && closure.time === time);
  if (matches.length === 0) return undefined;
  return [...matches].sort((a, b) => closureRank[b.status] - closureRank[a.status])[0];
}

function openingForSlot(openings: TeacherSlotOpening[], date: string, time: string) {
  return openings.find((opening) => opening.date === date && opening.time === time);
}

export function findLessonForSlot(lessons: SlotLesson[], date: string, time: string, excludedLessonId?: string) {
  return lessons.find((lesson) => lesson.id !== excludedLessonId && lessonBlocksSlot(lesson, date, time));
}

export function buildDaySlots({
  date,
  closures,
  openedSlots,
  lessons,
  excludedLessonId,
  includeClosed = true,
}: {
  date: string;
  closures: TeacherSlotClosure[];
  openedSlots: TeacherSlotOpening[];
  lessons: SlotLesson[];
  excludedLessonId?: string;
  includeClosed?: boolean;
}): DaySlot[] {
  return bookingSlotTimes().flatMap((time) => {
    const lesson = findLessonForSlot(lessons, date, time, excludedLessonId);
    const closure = closureForSlot(closures, date, time);
    const opening = openingForSlot(openedSlots, date, time);
    const status: DaySlotStatus = lesson
      ? "booked"
      : closure?.status === "approved"
        ? "closed"
        : closure?.status === "pending"
          ? "pending"
          : opening
            ? "open"
            : "closed";
    if (!includeClosed && status !== "open") return [];
    return [{ time, endTime: slotEnd(time), status, lesson, closure, opening }];
  });
}

export function findNextOpenSlot({
  closedSlots,
  openedSlots,
  lessons,
  fromDate,
  days = 14,
}: {
  closedSlots: TeacherSlotClosure[];
  openedSlots: TeacherSlotOpening[];
  lessons: SlotLesson[];
  fromDate: string;
  days?: number;
}) {
  const start = parseISODate(fromDate);
  for (let offset = 0; offset <= days; offset += 1) {
    const cursor = new Date(start.getTime());
    cursor.setDate(cursor.getDate() + offset);
    const date = toISODate(cursor);
    const slot = buildDaySlots({ date, closures: closedSlots, openedSlots, lessons, includeClosed: false })
      .find((item) => item.status === "open");
    if (slot) return { date, time: slot.time, endTime: slot.endTime };
  }
  return null;
}

export function slotStartDate(date: string, time: string) {
  const start = parseISODate(date);
  const [hours, minutes] = time.split(":").map(Number);
  start.setHours(hours, minutes, 0, 0);
  return start;
}

export function isSlotInPast(date: string, time: string, now = new Date()) {
  return slotStartDate(date, time).getTime() < now.getTime();
}

/** A lesson can be joined only while it is not completed/cancelled and its end time has not passed. */
export function canJoinLesson(lesson: { date: string; endTime: string; status: string }, now = new Date()) {
  if (lesson.status === "completed" || lesson.status === "cancelled") return false;
  return slotStartDate(lesson.date, lesson.endTime).getTime() > now.getTime();
}

export function formatStartRelative(date: string, time: string, now = new Date()) {
  const minutes = Math.round((slotStartDate(date, time).getTime() - now.getTime()) / 60_000);
  if (minutes === 0) return "Starting now";
  if (minutes > 0) {
    if (minutes < 60) return `Starts in ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (hours < 24) return remainder ? `Starts in ${hours}h ${remainder}m` : `Starts in ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Starts in ${days} day${days === 1 ? "" : "s"}`;
  }
  const past = Math.abs(minutes);
  if (past < 60) return `Started ${past} min ago`;
  const hours = Math.floor(past / 60);
  return `Started ${hours}h ago`;
}

export function formatSlotTiming(date: string, time: string, endTime: string, now = new Date()) {
  const start = slotStartDate(date, time);
  const end = slotStartDate(date, endTime);
  if (now >= end) return "Finished";
  if (now >= start) return "In progress";
  return formatStartRelative(date, time, now);
}

export function formatTimestamp(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
