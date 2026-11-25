import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * API-mode edit path: the request body a manager is allowed to send, the admin
 * email normalisation, the invite outcome, and the two-call partial failure.
 */

const requestMock = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({ role: "manager" as "manager" | "admin" }));

vi.mock("@/app/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/api/client")>("@/app/lib/api/client");
  return { ...actual, request: requestMock };
});

vi.mock("@/app/lib/auth/session", () => ({
  getSessionSnapshot: () => ({
    status: "authenticated" as const,
    user: { email: "actor@lumina.school", role: session.role },
  }),
}));

vi.mock("@/app/lib/school/api/bootstrap", () => ({
  refreshSchoolFromApi: vi.fn(async () => undefined),
}));

import { ApiError } from "@/app/lib/api/client";
import { updateTeacher, updateUser } from "@/app/lib/school/api/school";
import type { InviteOutcome } from "@/app/lib/api/types";

const invite: InviteOutcome = { sent: true, mode: "array", link: "http://localhost:3000/#set-password=token" };

function bodyOf(call: number): Record<string, unknown> {
  return (requestMock.mock.calls[call]?.[1] as { body: Record<string, unknown> }).body;
}

beforeEach(() => {
  requestMock.mockReset();
  session.role = "manager";
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "api");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("updateUser body shaping", () => {
  test("should send only the name for a manager session", async () => {
    requestMock.mockResolvedValue({ id: "user-1", name: "New Name", email: "new@example.com" });

    await expect(updateUser("user-1", { name: "New Name", email: "  NEW@Example.com " })).resolves.toEqual({});

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock.mock.calls[0]?.[0]).toBe("/users/user-1");
    expect(bodyOf(0)).toEqual({ name: "New Name" });
    expect("email" in bodyOf(0)).toBe(false);
  });

  test("should send the trimmed lowercase email for an admin session", async () => {
    session.role = "admin";
    requestMock.mockResolvedValue({ id: "user-1", name: "New Name" });

    await updateUser("user-1", { name: "New Name", email: "  NEW@Example.com " });

    expect(bodyOf(0)).toEqual({ name: "New Name", email: "new@example.com" });
  });

  test("should return the invite outcome of an invited person's email change", async () => {
    session.role = "admin";
    requestMock.mockResolvedValue({ id: "user-1", name: "New Name", email: "new@example.com", invite });

    await expect(updateUser("user-1", { name: "New Name", email: "new@example.com" })).resolves.toEqual({ invite });
  });

  test("should not invent an invite when the response has none", async () => {
    session.role = "admin";
    requestMock.mockResolvedValue({ id: "user-1", name: "New Name", email: "new@example.com" });

    await expect(updateUser("user-1", { name: "New Name", email: "new@example.com" })).resolves.toEqual({});
  });
});

describe("updateTeacher two-call edit", () => {
  const values = {
    name: "Grace Renamed",
    email: "grace.lee@lumina.school",
    headline: "Conversation and travel English",
    specializations: "Conversation, Travel English",
  };

  test("should keep the account save, report the profile failure and preserve the invite", async () => {
    requestMock
      .mockResolvedValueOnce({ id: "teacher-grace", name: "Grace Renamed", invite })
      .mockRejectedValueOnce(new ApiError(409, "CONFLICT", "Email is already registered"));

    await expect(updateTeacher("teacher-grace", values)).resolves.toEqual({
      invite,
      warning:
        "The account was saved, but the profile details were not: Email is already registered. Try again.",
    });
    expect(requestMock.mock.calls[0]?.[0]).toBe("/users/teacher-grace");
    expect(requestMock.mock.calls[1]?.[0]).toBe("/teachers/teacher-grace");
  });

  test("should report the partial save without inventing an invite", async () => {
    requestMock
      .mockResolvedValueOnce({ id: "teacher-grace", name: "Grace Renamed" })
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Something went wrong"));

    await expect(updateTeacher("teacher-grace", values)).resolves.toEqual({
      warning: "The account was saved, but the profile details were not: Something went wrong. Try again.",
    });
  });

  test("should pass the invite outcome through a successful edit", async () => {
    requestMock
      .mockResolvedValueOnce({ id: "teacher-grace", name: "Grace Renamed", invite })
      .mockResolvedValueOnce(undefined);

    await expect(updateTeacher("teacher-grace", values)).resolves.toEqual({ invite });
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  test("should not wrap a failure of the first (account) call", async () => {
    requestMock.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "You do not have access to this resource."));

    const failure = await updateTeacher("teacher-grace", values).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toBe("You do not have access to this resource.");
    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});
