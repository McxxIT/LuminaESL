import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getSchoolSnapshot } from "@/app/lib/school";
import { rateLesson } from "@/app/lib/school/services/quality";
import { bookAs, setLessonStatus } from "./helpers/fixtures";
import { dayFrom, freezeTime, freshSchool, sync, TEST_NOW } from "./helpers/school";

const STUDENT = "student-ava";

function completedLesson() {
  const lesson = bookAs(STUDENT, "teacher-alex", dayFrom(TEST_NOW, 3), "10:00");
  setLessonStatus(lesson.id, "completed");
  return lesson;
}

beforeEach(() => {
  freezeTime();
  freshSchool();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("lesson ratings", () => {
  test("a student rates a completed lesson once per source (student and parent)", () => {
    const lesson = completedLesson();
    expect(sync(rateLesson(STUDENT, lesson.id, { from: "student", score: 5 }))).toEqual({ ok: true, value: undefined });
    expect(sync(rateLesson(STUDENT, lesson.id, { from: "student", score: 4 }))).toEqual({ ok: false, error: "You already rated this lesson." });
    expect(sync(rateLesson(STUDENT, lesson.id, { from: "parent", score: 4, comment: "Great" })).ok).toBe(true);
    expect(sync(rateLesson(STUDENT, lesson.id, { from: "parent", score: 3 }))).toEqual({ ok: false, error: "A parent rating already exists for this lesson." });
    const ratings = Object.values(getSchoolSnapshot().collections.ratings).filter((rating) => rating.lessonId === lesson.id);
    expect(ratings.map((rating) => rating.from).sort()).toEqual(["parent", "student"]);
    expect(ratings.find((rating) => rating.from === "parent")?.authorId).toBeUndefined();
  });

  test("scores must be whole stars from 1 to 5", () => {
    const lesson = completedLesson();
    const error = { ok: false, error: "Choose between 1 and 5 stars." };
    expect(sync(rateLesson(STUDENT, lesson.id, { from: "student", score: 0 }))).toEqual(error);
    expect(sync(rateLesson(STUDENT, lesson.id, { from: "student", score: 6 }))).toEqual(error);
    expect(sync(rateLesson(STUDENT, lesson.id, { from: "student", score: 4.5 }))).toEqual(error);
  });

  test("only completed lessons can be rated, and only by their student", () => {
    const lesson = bookAs(STUDENT, "teacher-alex", dayFrom(TEST_NOW, 3), "10:00");
    expect(sync(rateLesson(STUDENT, lesson.id, { from: "student", score: 5 }))).toEqual({ ok: false, error: "You can rate a lesson once it is completed." });
    setLessonStatus(lesson.id, "completed");
    expect(sync(rateLesson("student-noah", lesson.id, { from: "student", score: 5 }))).toEqual({ ok: false, error: "You don't have permission to do that." });
  });
});
