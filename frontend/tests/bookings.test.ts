import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { creditBalance, getSchoolSnapshot, updateSchool, type Lesson } from "@/app/lib/school";
import { patch } from "@/app/lib/school/repositories";
import { bookLesson, cancelLessonByStudent, rebookLesson } from "@/app/lib/school/services/bookings";
import { LESSON_CREDIT_HOURS } from "@/app/lib/school/services/common";
import { openSlot } from "@/app/lib/school/services/teaching";
import { dayFrom, freezeTime, freshSchool, stubRandom, sync, TEST_NOW } from "./helpers/school";

const TEACHER = "teacher-alex";
const STUDENT = "student-ava";

function open(date: string, time: string) {
  expect(sync(openSlot(TEACHER, date, time))).toEqual({ ok: true, value: undefined });
}

function book(date: string, time: string): Lesson {
  open(date, time);
  const result = sync(bookLesson(STUDENT, { teacherId: TEACHER, date, time, title: "Speaking", focus: ["fluency"] }));
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function setStatus(lessonId: string, status: Lesson["status"]) {
  updateSchool((draft) => { patch(draft, "lessons", lessonId, { status }); });
}

beforeEach(() => {
  freezeTime();
  freshSchool();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("student cancellation", () => {
  test("refunds one credit when cancelled at least studentLateCancellationHours ahead", () => {
    const lesson = book(dayFrom(TEST_NOW, 3), "10:00");
    const before = creditBalance(getSchoolSnapshot(), STUDENT);
    const result = sync(cancelLessonByStudent(STUDENT, lesson.id, "Travelling"));
    expect(result).toEqual({ ok: true, value: { refunded: true } });
    expect(creditBalance(getSchoolSnapshot(), STUDENT)).toBe(before + LESSON_CREDIT_HOURS);
    expect(getSchoolSnapshot().collections.lessons[lesson.id]?.status).toBe("cancelled");
  });

  test("does not refund a late cancellation", () => {
    // 09:00 now, lesson at 15:00 today: 6 hours ahead, inside the 24-hour window.
    const lesson = book(dayFrom(TEST_NOW, 0), "15:00");
    const before = creditBalance(getSchoolSnapshot(), STUDENT);
    expect(sync(cancelLessonByStudent(STUDENT, lesson.id, ""))).toEqual({ ok: true, value: { refunded: false } });
    expect(creditBalance(getSchoolSnapshot(), STUDENT)).toBe(before);
  });

  test("refuses to cancel a lesson that is not scheduled", () => {
    const lesson = book(dayFrom(TEST_NOW, 3), "10:00");
    setStatus(lesson.id, "completed");
    expect(sync(cancelLessonByStudent(STUDENT, lesson.id, ""))).toEqual({ ok: false, error: "Only upcoming lessons can be cancelled." });
  });
});

describe("local rebook (parity with POST /lessons/:id/rebook)", () => {
  test("takes the next plan, a fresh ESL room code and debits exactly one lesson credit", () => {
    const original = book(dayFrom(TEST_NOW, 3), "10:00");
    const target = { date: dayFrom(TEST_NOW, 4), time: "11:00" };
    open(target.date, target.time);
    stubRandom(0.5); // room code ESL-5500; the original was random
    const before = creditBalance(getSchoolSnapshot(), STUDENT);

    const result = sync(rebookLesson(STUDENT, original.id, target.date, target.time));
    if (!result.ok) throw new Error(result.error);
    const rebooked = result.value;

    expect(rebooked.roomCode).toBe("ESL-5500");
    expect(rebooked.roomCode).toMatch(/^ESL-\d{4}$/);
    expect(rebooked.lessonPlanId).toBeTruthy();
    expect(rebooked.lessonPlanId).not.toBe(original.lessonPlanId);
    expect(rebooked.planAttachedBy).toBeTruthy();
    expect(rebooked.enrollmentId).toBe(original.enrollmentId);
    expect(creditBalance(getSchoolSnapshot(), STUDENT)).toBe(before - LESSON_CREDIT_HOURS);
  });

  test("rebooks a completed original", () => {
    const original = book(dayFrom(TEST_NOW, 3), "10:00");
    setStatus(original.id, "completed");
    const target = { date: dayFrom(TEST_NOW, 4), time: "11:00" };
    open(target.date, target.time);
    expect(sync(rebookLesson(STUDENT, original.id, target.date, target.time)).ok).toBe(true);
  });

  test("refuses a live original without charging", () => {
    const original = book(dayFrom(TEST_NOW, 3), "10:00");
    setStatus(original.id, "live");
    const target = { date: dayFrom(TEST_NOW, 4), time: "11:00" };
    open(target.date, target.time);
    const before = creditBalance(getSchoolSnapshot(), STUDENT);
    expect(sync(rebookLesson(STUDENT, original.id, target.date, target.time))).toEqual({ ok: false, error: "A lesson in progress cannot be rebooked." });
    expect(creditBalance(getSchoolSnapshot(), STUDENT)).toBe(before);
  });

  test("requires the target slot to be open", () => {
    const original = book(dayFrom(TEST_NOW, 3), "10:00");
    const result = sync(rebookLesson(STUDENT, original.id, dayFrom(TEST_NOW, 5), "12:00"));
    expect(result).toEqual({ ok: false, error: "That slot is no longer open. Choose another time." });
  });

  test("stays on the local branch with the data flags unset", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", undefined);
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", undefined);
    const original = book(dayFrom(TEST_NOW, 3), "10:00");
    open(dayFrom(TEST_NOW, 4), "11:00");
    // The API branch returns a promise; the local branch returns a result synchronously.
    const result = rebookLesson(STUDENT, original.id, dayFrom(TEST_NOW, 4), "11:00");
    expect(result).not.toBeInstanceOf(Promise);
    vi.unstubAllEnvs();
  });
});
