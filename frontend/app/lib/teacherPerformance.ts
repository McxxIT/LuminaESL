import { slotStartDate } from "./scheduling";
import { isoDaysFromNow } from "./student";
import type { TeacherLesson, TeacherLessonRating } from "./types";

/** Every teacher starts each window at this score; the result is clamped to 0–100. */
export const PERFORMANCE_BASE_POINTS = 100;
export const PERFORMANCE_WINDOW_DAYS = 30;
/** A teacher cancellation requested less than this many hours before the start is "on the spot". */
export const ON_THE_SPOT_CANCELLATION_HOURS = 2;
export const ON_THE_SPOT_CANCELLATION_POINTS = -10;
export const TEACHER_ABSENCE_POINTS = -20;
export const RATING_POINTS: Record<TeacherLessonRating["score"], number> = { 5: 2, 4: 1, 3: 0, 2: -3, 1: -5 };

/** School-configurable parts of the scoring (admin School settings). Defaults match the constants above. */
export type PerformanceRules = { onTheSpotHours: number; windowDays: number };
export const DEFAULT_PERFORMANCE_RULES: PerformanceRules = { onTheSpotHours: ON_THE_SPOT_CANCELLATION_HOURS, windowDays: PERFORMANCE_WINDOW_DAYS };

export type PerformanceEventKind = "on-the-spot-cancellation" | "absence" | "rating";

export type PerformanceEvent = {
  id: string;
  kind: PerformanceEventKind;
  lessonId: string;
  date: string;
  time: string;
  title: string;
  detail: string;
  points: number;
  rating?: TeacherLessonRating;
};

export type PerformanceTier = "Excellent" | "Good" | "Fair" | "At risk";

export type TeacherPerformance = {
  score: number;
  tier: PerformanceTier;
  events: PerformanceEvent[];
  onTheSpotCancellations: { count: number; points: number };
  absences: { count: number; points: number };
  ratings: { count: number; average: number; points: number; distribution: Record<TeacherLessonRating["score"], number>; items: PerformanceEvent[] };
  /** The rules this score was computed with. */
  rules: PerformanceRules;
};

/** True when an approved teacher cancellation was requested within the on-the-spot window. */
export function isOnTheSpotCancellation(lesson: TeacherLesson, onTheSpotHours = ON_THE_SPOT_CANCELLATION_HOURS) {
  const cancellation = lesson.cancellation;
  if (!cancellation?.requestedAt || lesson.status !== "cancelled" || cancellation.status !== "approved") return false;
  const requested = new Date(cancellation.requestedAt).getTime();
  if (Number.isNaN(requested)) return false;
  const start = slotStartDate(lesson.date, lesson.time).getTime();
  return start - requested < onTheSpotHours * 60 * 60 * 1000;
}

export function performanceTier(score: number): PerformanceTier {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "At risk";
}

export function computeTeacherPerformance(lessons: TeacherLesson[], rules: PerformanceRules = DEFAULT_PERFORMANCE_RULES): TeacherPerformance {
  const since = isoDaysFromNow(-rules.windowDays);
  const today = isoDaysFromNow(0);
  const events: PerformanceEvent[] = [];

  for (const lesson of lessons) {
    if (lesson.date < since || lesson.date > today) continue;
    const base = { lessonId: lesson.id, date: lesson.date, time: lesson.time };
    if (isOnTheSpotCancellation(lesson, rules.onTheSpotHours)) {
      events.push({ ...base, id: `${lesson.id}-cancel`, kind: "on-the-spot-cancellation", title: "On-the-spot cancellation", detail: `${lesson.title} with ${lesson.studentName} · ${lesson.cancellation?.reason ?? "Cancelled"}`, points: ON_THE_SPOT_CANCELLATION_POINTS });
    }
    if (lesson.teacherAbsence) {
      events.push({ ...base, id: `${lesson.id}-absence`, kind: "absence", title: "Absent while student was present", detail: `${lesson.title} with ${lesson.studentName} · ${lesson.teacherAbsence.note}`, points: TEACHER_ABSENCE_POINTS });
    }
    lesson.ratings?.forEach((rating, index) => {
      events.push({ ...base, id: `${lesson.id}-rating-${index}`, kind: "rating", title: `${rating.score}-star ${rating.from} rating`, detail: `${rating.name} · ${lesson.title}`, points: RATING_POINTS[rating.score], rating });
    });
  }

  events.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const sum = (kind: PerformanceEventKind) => events.filter((event) => event.kind === kind);
  const cancellations = sum("on-the-spot-cancellation");
  const absences = sum("absence");
  const ratingEvents = sum("rating");
  const distribution: Record<TeacherLessonRating["score"], number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  ratingEvents.forEach((event) => { if (event.rating) distribution[event.rating.score] += 1; });
  const total = (items: PerformanceEvent[]) => items.reduce((points, event) => points + event.points, 0);
  const average = ratingEvents.length ? ratingEvents.reduce((acc, event) => acc + (event.rating?.score ?? 0), 0) / ratingEvents.length : 0;
  const score = Math.max(0, Math.min(100, PERFORMANCE_BASE_POINTS + total(events)));

  return {
    score,
    tier: performanceTier(score),
    events,
    onTheSpotCancellations: { count: cancellations.length, points: total(cancellations) },
    absences: { count: absences.length, points: total(absences) },
    ratings: { count: ratingEvents.length, average, points: total(ratingEvents), distribution, items: ratingEvents },
    rules,
  };
}

export function formatPoints(points: number) {
  return points > 0 ? `+${points}` : `${points}`;
}
