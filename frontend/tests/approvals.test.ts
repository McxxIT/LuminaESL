import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { creditBalance, getSchoolSnapshot } from "@/app/lib/school";
import { reviewRequest } from "@/app/lib/school/services/approvals";
import { LESSON_CREDIT_HOURS } from "@/app/lib/school/services/common";
import { requestLessonCancellation } from "@/app/lib/school/services/teaching";
import { bookAs, setLessonStatus } from "./helpers/fixtures";
import { dayFrom, freezeTime, freshSchool, sync, TEST_NOW } from "./helpers/school";

const TEACHER = "teacher-alex";
const STUDENT = "student-ava";
const OWN_MANAGER = "manager-priya";
const OTHER_MANAGER = "manager-marco";
const denied = { ok: false, error: "You don't have permission to do that." };

function requestCancellation() {
  const lesson = bookAs(STUDENT, TEACHER, dayFrom(TEST_NOW, 3), "10:00");
  expect(sync(requestLessonCancellation(TEACHER, lesson.id, { reason: "Sick", comment: "Fever since this morning" })).ok).toBe(true);
  const request = Object.values(getSchoolSnapshot().collections.requests).find((item) => item.type === "lesson-cancellation" && item.lessonId === lesson.id);
  if (!request) throw new Error("cancellation request was not created");
  return { lesson, request };
}

beforeEach(() => {
  freezeTime();
  freshSchool();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("lesson cancellation requests", () => {
  test("approval cancels the lesson and refunds the student", () => {
    const { lesson, request } = requestCancellation();
    const before = creditBalance(getSchoolSnapshot(), STUDENT);
    expect(sync(reviewRequest(OWN_MANAGER, request.id, "approved", ""))).toEqual({ ok: true, value: undefined });
    const data = getSchoolSnapshot();
    expect(data.collections.lessons[lesson.id]?.status).toBe("cancelled");
    expect(data.collections.requests[request.id]?.status).toBe("approved");
    expect(creditBalance(data, STUDENT)).toBe(before + LESSON_CREDIT_HOURS);
  });

  test("decline keeps the lesson and the credits", () => {
    const { lesson, request } = requestCancellation();
    const before = creditBalance(getSchoolSnapshot(), STUDENT);
    expect(sync(reviewRequest(OWN_MANAGER, request.id, "rejected", "Please teach it")).ok).toBe(true);
    const data = getSchoolSnapshot();
    expect(data.collections.lessons[lesson.id]?.status).toBe("scheduled");
    expect(data.collections.requests[request.id]?.status).toBe("rejected");
    expect(creditBalance(data, STUDENT)).toBe(before);
  });

  test("refuses to approve the cancellation of a completed lesson and leaves it pending", () => {
    const { lesson, request } = requestCancellation();
    setLessonStatus(lesson.id, "completed");
    expect(sync(reviewRequest(OWN_MANAGER, request.id, "approved", ""))).toEqual({ ok: false, error: "That lesson is already completed and cannot be cancelled." });
    expect(getSchoolSnapshot().collections.requests[request.id]?.status).toBe("pending");
  });

  test("a request can only be reviewed once", () => {
    const { request } = requestCancellation();
    expect(sync(reviewRequest(OWN_MANAGER, request.id, "rejected", "")).ok).toBe(true);
    expect(sync(reviewRequest(OWN_MANAGER, request.id, "approved", ""))).toEqual({ ok: false, error: "That request has already been reviewed." });
  });

  test("only the admin or the teacher's own manager may review", () => {
    const { request } = requestCancellation();
    expect(sync(reviewRequest(OTHER_MANAGER, request.id, "approved", ""))).toEqual(denied);
    expect(sync(reviewRequest(TEACHER, request.id, "approved", ""))).toEqual(denied);
    expect(sync(reviewRequest("admin-jamie", request.id, "approved", "")).ok).toBe(true);
  });

  test("a teacher can only request cancellation of a scheduled lesson", () => {
    const lesson = bookAs(STUDENT, TEACHER, dayFrom(TEST_NOW, 3), "10:00");
    setLessonStatus(lesson.id, "completed");
    expect(sync(requestLessonCancellation(TEACHER, lesson.id, { reason: "Sick", comment: "Fever" }))).toEqual({ ok: false, error: "Only scheduled lessons can be cancelled." });
  });
});
