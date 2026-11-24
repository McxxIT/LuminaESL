import { beforeEach, describe, expect, test } from "vitest";
import { getSchoolSnapshot } from "@/app/lib/school";
import { assignHomework, reviewHomework, submitHomework } from "@/app/lib/school/services/homework";
import { freshSchool, sync } from "./helpers/school";

const TEACHER = "teacher-alex";
const STUDENT = "student-ava";

function assign() {
  const result = sync(assignHomework(TEACHER, STUDENT, { title: "Describe your weekend", dueLabel: "Friday" }));
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

beforeEach(() => {
  freshSchool();
});

describe("homework lifecycle", () => {
  test("assign, submit and review", () => {
    const assignment = assign();
    expect(assignment.status).toBe("assigned");
    expect(sync(submitHomework(STUDENT, assignment.id, "I went hiking."))).toEqual({ ok: true, value: undefined });
    expect(getSchoolSnapshot().collections.assignments[assignment.id]?.status).toBe("submitted");
    expect(sync(reviewHomework(TEACHER, assignment.id, { feedback: "Nice", grade: "A" })).ok).toBe(true);
    const reviewed = getSchoolSnapshot().collections.assignments[assignment.id];
    expect(reviewed?.status).toBe("reviewed");
    expect(reviewed?.grade).toBe("A");
  });

  test("a teacher can only assign to their own students", () => {
    expect(sync(assignHomework("teacher-daniel", STUDENT, { title: "Essay", dueLabel: "" }))).toEqual({ ok: false, error: "You can only set homework for your own students." });
  });

  test("a title is required", () => {
    expect(sync(assignHomework(TEACHER, STUDENT, { title: "  ", dueLabel: "" }))).toEqual({ ok: false, error: "Give the homework a title." });
  });

  test("an empty answer cannot be submitted, and only by the student it belongs to", () => {
    const assignment = assign();
    expect(sync(submitHomework(STUDENT, assignment.id, "   "))).toEqual({ ok: false, error: "Add your answer before submitting." });
    expect(sync(submitHomework("student-noah", assignment.id, "Mine"))).toEqual({ ok: false, error: "You don't have permission to do that." });
  });

  test("a reviewed assignment cannot be reviewed or submitted again", () => {
    const assignment = assign();
    expect(sync(reviewHomework(TEACHER, assignment.id, { feedback: "Done" })).ok).toBe(true);
    expect(sync(reviewHomework(TEACHER, assignment.id, { feedback: "Again" }))).toEqual({ ok: false, error: "This assignment has already been reviewed." });
    expect(sync(submitHomework(STUDENT, assignment.id, "Late answer"))).toEqual({ ok: false, error: "This assignment has already been reviewed." });
  });
});
