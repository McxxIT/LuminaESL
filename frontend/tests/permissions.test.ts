import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { can, getSchoolSnapshot, type PermissionTarget, type SchoolAction } from "@/app/lib/school";
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
