import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  configureSchoolDataSource,
  configureSchoolStore,
  createMemoryAdapter,
  getSchoolSnapshot,
  hydrateSchool,
} from "@/app/lib/school";
import { createSeedSchool } from "@/app/lib/school/seed";
import { updateStudent, updateTeacher } from "@/app/lib/school/services/people";
import { TEST_NOW } from "./helpers/school";

/**
 * API-mode parity for the manager email rule (review finding N1): the service
 * must refuse a manager's email change before the request, instead of letting
 * the API layer drop the field and the UI report success.
 */

const api = vi.hoisted(() => ({
  updateTeacher: vi.fn(),
  updateStudent: vi.fn(),
  refreshSchoolAfterCommand: vi.fn(async () => undefined),
}));

vi.mock("@/app/lib/school/api/school", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/school/api/school")>(
    "@/app/lib/school/api/school",
  );
  return {
    ...actual,
    updateTeacher: api.updateTeacher,
    updateStudent: api.updateStudent,
    refreshSchoolAfterCommand: api.refreshSchoolAfterCommand,
  };
});

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

const currentEmail = (id: string) => getSchoolSnapshot().collections.users[id]!.email;

beforeEach(() => {
  api.updateTeacher.mockReset();
  api.updateStudent.mockReset();
  api.refreshSchoolAfterCommand.mockClear();
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "api");
  configureSchoolDataSource("api");
  configureSchoolStore(createMemoryAdapter(null));
  hydrateSchool(createSeedSchool(TEST_NOW.toISOString()));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a manager editing through the API branch", () => {
  test("should refuse a teacher email change before any request is sent", async () => {
    const result = await updateTeacher(
      "manager-priya",
      "teacher-grace",
      teacherInput("Grace Lee", "grace.new@lumina.school"),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Only an admin can change an email address.");
    expect(api.updateTeacher).not.toHaveBeenCalled();
  });

  test("should allow an unchanged email in a different case (the disabled field still submits it)", async () => {
    api.updateTeacher.mockResolvedValue({});

    const result = await updateTeacher(
      "manager-priya",
      "teacher-grace",
      teacherInput("Grace Lee", currentEmail("teacher-grace").toUpperCase()),
    );

    expect(result.ok).toBe(true);
    expect(api.updateTeacher).toHaveBeenCalledTimes(1);
  });

  test("should allow a name-only edit for a manager", async () => {
    api.updateTeacher.mockResolvedValue({});

    const result = await updateTeacher(
      "manager-priya",
      "teacher-grace",
      teacherInput("Grace Renamed", currentEmail("teacher-grace")),
    );

    expect(result.ok).toBe(true);
    expect(api.updateTeacher).toHaveBeenCalledWith(
      "teacher-grace",
      expect.objectContaining({ name: "Grace Renamed" }),
    );
  });

  test("should refuse a student email change before any request is sent", async () => {
    const result = await updateStudent(
      "manager-priya",
      "student-leo",
      studentInput("Leo Fischer", "leo.new@lumina.school"),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Only an admin can change an email address.");
    expect(api.updateStudent).not.toHaveBeenCalled();
  });

  test("should let an admin change a teacher's email", async () => {
    api.updateTeacher.mockResolvedValue({});

    const result = await updateTeacher(
      "admin-jamie",
      "teacher-grace",
      teacherInput("Grace Lee", "grace.new@lumina.school"),
    );

    expect(result.ok).toBe(true);
    expect(api.updateTeacher).toHaveBeenCalledTimes(1);
  });

  test("should pass the invite outcome through", async () => {
    const invite = { sent: true as const, mode: "array" as const, link: "http://localhost:3000/#set-password=token" };
    api.updateTeacher.mockResolvedValue({ invite });

    const result = await updateTeacher(
      "admin-jamie",
      "teacher-grace",
      teacherInput("Grace Lee", "grace.new@lumina.school"),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ invite });
  });
});
