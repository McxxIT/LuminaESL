import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { can, getSchoolSnapshot, updateSchool, type PermissionTarget, type SchoolAction } from "@/app/lib/school";
import { upsert } from "@/app/lib/school/repositories";
import { addLibraryItem, bookAs } from "./helpers/fixtures";
import { dayFrom, freezeTime, freshSchool, TEST_NOW } from "./helpers/school";

function allowed(actorId: string, action: SchoolAction, target: PermissionTarget = {}) {
  const data = getSchoolSnapshot();
  return can(data, data.collections.users[actorId], action, target);
}

beforeEach(() => {
  freezeTime();
  freshSchool();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("library.manage", () => {
  test("admin and managers only", () => {
    expect(allowed("admin-jamie", "library.manage")).toBe(true);
    expect(allowed("manager-marco", "library.manage")).toBe(true);
    expect(allowed("teacher-alex", "library.manage")).toBe(false);
    expect(allowed("student-ava", "library.manage")).toBe(false);
  });
});

describe("library.edit", () => {
  test("the admin, or the manager who created the item", () => {
    addLibraryItem("lib-p", "manager-priya");
    const target = { libraryItemId: "lib-p" };
    expect(allowed("admin-jamie", "library.edit", target)).toBe(true);
    expect(allowed("manager-priya", "library.edit", target)).toBe(true);
    expect(allowed("manager-marco", "library.edit", target)).toBe(false);
    expect(allowed("teacher-alex", "library.edit", target)).toBe(false);
  });
});

describe("lesson.attachLibraryItem", () => {
  test("admin any lesson; a manager only lessons of a teacher on their team", () => {
    const lesson = bookAs("student-ava", "teacher-alex", dayFrom(TEST_NOW, 3), "10:00");
    const target = { lessonId: lesson.id };
    expect(allowed("admin-jamie", "lesson.attachLibraryItem", target)).toBe(true);
    expect(allowed("manager-priya", "lesson.attachLibraryItem", target)).toBe(true);
    expect(allowed("manager-marco", "lesson.attachLibraryItem", target)).toBe(false);
    expect(allowed("teacher-alex", "lesson.attachLibraryItem", target)).toBe(false);
    expect(allowed("student-ava", "lesson.attachLibraryItem", target)).toBe(false);
  });

  test("team scope follows the teacher, not the student's roster manager", () => {
    // student-kenji is on manager-marco's roster; teacher-grace is on manager-priya's team.
    const target = { teacherId: "teacher-grace", studentId: "student-kenji" };
    expect(allowed("manager-priya", "lesson.attachLibraryItem", target)).toBe(true);
    expect(allowed("manager-marco", "lesson.attachLibraryItem", target)).toBe(false);
  });

  test("a paused account is denied", () => {
    expect(allowed("student-diego", "lesson.book")).toBe(false);
  });
});

describe("account.invite", () => {
  test("admin any person; a manager only their own teacher or roster student", () => {
    expect(allowed("admin-jamie", "account.invite", { teacherId: "teacher-daniel" })).toBe(true);
    expect(allowed("admin-jamie", "account.invite", { studentId: "student-kenji" })).toBe(true);
    expect(allowed("manager-priya", "account.invite", { teacherId: "teacher-grace" })).toBe(true);
    expect(allowed("manager-priya", "account.invite", { studentId: "student-leo" })).toBe(true);
    expect(allowed("manager-priya", "account.invite", { teacherId: "teacher-daniel" })).toBe(false);
    expect(allowed("manager-priya", "account.invite", { studentId: "student-kenji" })).toBe(false);
    expect(allowed("manager-marco", "account.invite", { studentId: "student-kenji" })).toBe(true);
    expect(allowed("manager-priya", "account.invite")).toBe(false);
    expect(allowed("teacher-alex", "account.invite", { studentId: "student-ava" })).toBe(false);
    expect(allowed("student-ava", "account.invite", { studentId: "student-ava" })).toBe(false);
  });

  test("intentional asymmetry: enrollment with a team teacher is not enough in the frontend", () => {
    // student-kenji is on manager-marco's roster. Enrolled with teacher-grace (manager-priya's
    // team), the backend `managerOwnsStudent` would answer true for manager-priya; the frontend
    // only offers the action to the roster manager, so it is never looser than the backend.
    updateSchool((draft) => {
      upsert(draft, "enrollments", {
        id: "enrollment-kenji-grace",
        studentId: "student-kenji",
        teacherId: "teacher-grace",
        courseId: Object.keys(draft.collections.courses)[0] ?? "course",
        nextPlanIndex: 0,
        status: "active",
        startedAt: new Date().toISOString(),
      });
    });
    expect(allowed("manager-priya", "account.invite", { studentId: "student-kenji" })).toBe(false);
    expect(allowed("manager-marco", "account.invite", { studentId: "student-kenji" })).toBe(true);
  });

  test("teacher.create and student.create are unchanged: admin and managers", () => {
    for (const action of ["teacher.create", "student.create"] as const) {
      expect(allowed("admin-jamie", action)).toBe(true);
      expect(allowed("manager-marco", action)).toBe(true);
      expect(allowed("teacher-alex", action)).toBe(false);
      expect(allowed("student-ava", action)).toBe(false);
    }
  });
});

describe("teacher.manage and student.manage", () => {
  test("admin any person; a manager only their own team; teachers and students never", () => {
    expect(allowed("admin-jamie", "teacher.manage", { teacherId: "teacher-grace" })).toBe(true);
    expect(allowed("admin-jamie", "student.manage", { studentId: "student-kenji" })).toBe(true);
    expect(allowed("manager-priya", "teacher.manage", { teacherId: "teacher-grace" })).toBe(true);
    expect(allowed("manager-priya", "student.manage", { studentId: "student-leo" })).toBe(true);
    expect(allowed("manager-priya", "teacher.manage", { teacherId: "teacher-daniel" })).toBe(false);
    expect(allowed("manager-marco", "student.manage", { studentId: "student-leo" })).toBe(false);
    expect(allowed("teacher-alex", "teacher.manage", { teacherId: "teacher-grace" })).toBe(false);
    expect(allowed("teacher-alex", "student.manage", { studentId: "student-leo" })).toBe(false);
    expect(allowed("student-ava", "student.manage", { studentId: "student-ava" })).toBe(false);
  });

  test("intentional asymmetry: enrollment with a team teacher is not enough in the frontend", () => {
    // student-kenji is on manager-marco's roster. Enrolled with teacher-grace (manager-priya's
    // team), the backend `managerOwnsStudent` would answer true for manager-priya; the frontend
    // roster-only scope answers false, so it is never looser than the backend.
    updateSchool((draft) => {
      upsert(draft, "enrollments", {
        id: "enrollment-kenji-grace-manage",
        studentId: "student-kenji",
        teacherId: "teacher-grace",
        courseId: Object.keys(draft.collections.courses)[0] ?? "course",
        nextPlanIndex: 0,
        status: "active",
        startedAt: new Date().toISOString(),
      });
    });
    expect(allowed("manager-priya", "student.manage", { studentId: "student-kenji" })).toBe(false);
    expect(allowed("manager-marco", "student.manage", { studentId: "student-kenji" })).toBe(true);
  });
});

describe("invited accounts", () => {
  test("an invited person can do nothing until they set a password", () => {
    updateSchool((draft) => {
      const manager = draft.collections.users["manager-priya"];
      if (manager) manager.status = "invited";
    });
    expect(allowed("manager-priya", "teacher.create")).toBe(false);
    expect(allowed("manager-priya", "account.invite", { teacherId: "teacher-grace" })).toBe(false);
    expect(allowed("admin-jamie", "account.invite", { teacherId: "teacher-grace" })).toBe(true);
  });
});
