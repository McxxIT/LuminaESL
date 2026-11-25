import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getSchoolSnapshot } from "@/app/lib/school";
import {
  setPersonStatus,
  updateManager,
  updateStudent,
  updateTeacher,
} from "@/app/lib/school/services/people";
import { freezeTime, freshSchool, sync } from "./helpers/school";

/**
 * Demo/local parity for the manager edit rules: a manager may rename and pause
 * their own team but never change an email; an admin may change any email.
 */

const user = (id: string) => getSchoolSnapshot().collections.users[id]!;

const teacherInput = (name: string, email: string) => ({
  name,
  email,
  headline: "Conversation and travel English",
  specializations: "Conversation, Travel English",
});

const studentInput = (name: string, email: string) => ({
  name,
  email,
  level: "A2 Elementary",
  targetLevel: "B1 Intermediate",
  goal: "Order and chat confidently while travelling",
});

beforeEach(() => {
  vi.unstubAllEnvs();
  freezeTime();
  freshSchool();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("a manager editing a team teacher", () => {
  test("should refuse a manager email change in the local branch and allow a name edit", () => {
    const original = user("teacher-grace");

    const refused = sync(updateTeacher("manager-priya", "teacher-grace", teacherInput("Grace Lee", "grace.new@lumina.school")));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe("Only an admin can change an email address.");
    expect(user("teacher-grace").email).toBe(original.email);

    const allowed = sync(updateTeacher("manager-priya", "teacher-grace", teacherInput("Grace Lee", original.email)));
    expect(allowed.ok).toBe(true);
    expect(user("teacher-grace").name).toBe("Grace Lee");
    expect(user("teacher-grace").email).toBe(original.email);
  });

  test("should accept an unchanged email in a different case (the disabled field still submits it)", () => {
    const original = user("teacher-grace");

    const result = sync(updateTeacher("manager-priya", "teacher-grace", teacherInput("Grace Lee", original.email.toUpperCase())));

    expect(result.ok).toBe(true);
    expect(user("teacher-grace").email).toBe(original.email);
  });

  test("should refuse a manager who does not own the teacher", () => {
    const before = user("teacher-grace").name;
    const result = sync(updateTeacher("manager-marco", "teacher-grace", teacherInput("Not Allowed", user("teacher-grace").email)));

    expect(result.ok).toBe(false);
    expect(user("teacher-grace").name).toBe(before);
  });

  test("should let the admin change the email", () => {
    const result = sync(updateTeacher("admin-jamie", "teacher-grace", teacherInput("Grace Lee", "grace.new@lumina.school")));

    expect(result.ok).toBe(true);
    expect(user("teacher-grace").email).toBe("grace.new@lumina.school");
  });
});

describe("a manager editing a team student", () => {
  test("should refuse a manager email change and allow a name edit", () => {
    const original = user("student-leo");

    const refused = sync(updateStudent("manager-priya", "student-leo", studentInput("Leo Fischer", "leo.new@lumina.school")));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe("Only an admin can change an email address.");
    expect(user("student-leo").email).toBe(original.email);

    const allowed = sync(updateStudent("manager-priya", "student-leo", studentInput("Leo Fischer Jr", original.email)));
    expect(allowed.ok).toBe(true);
    expect(user("student-leo").name).toBe("Leo Fischer Jr");
  });

  test("should let the admin change a student's email", () => {
    const result = sync(updateStudent("admin-jamie", "student-leo", studentInput("Leo Fischer", "leo.new@lumina.school")));

    expect(result.ok).toBe(true);
    expect(user("student-leo").email).toBe("leo.new@lumina.school");
  });
});

describe("pause and reactivate", () => {
  test("should let a manager pause and reactivate their own team, but not another team", () => {
    expect(sync(setPersonStatus("manager-priya", "teacher-grace", "paused")).ok).toBe(true);
    expect(user("teacher-grace").status).toBe("paused");

    expect(sync(setPersonStatus("manager-marco", "teacher-grace", "active")).ok).toBe(false);
    expect(user("teacher-grace").status).toBe("paused");

    expect(sync(setPersonStatus("manager-priya", "teacher-grace", "active")).ok).toBe(true);
    expect(user("teacher-grace").status).toBe("active");
  });

  test("should let a manager pause their own student", () => {
    expect(sync(setPersonStatus("manager-priya", "student-leo", "paused")).ok).toBe(true);
    expect(user("student-leo").status).toBe("paused");
  });
});

describe("managers records", () => {
  test("should stay admin-only", () => {
    const managerAttempt = sync(updateManager("manager-priya", "manager-marco", { name: "Marco B", email: "marco.new@lumina.school" }));
    expect(managerAttempt.ok).toBe(false);

    const adminAttempt = sync(updateManager("admin-jamie", "manager-marco", { name: "Marco Bianchi", email: "marco.new@lumina.school" }));
    expect(adminAttempt.ok).toBe(true);
    expect(user("manager-marco").email).toBe("marco.new@lumina.school");
  });
});
