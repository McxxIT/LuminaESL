import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  changePasswordSchema,
  hashPassword,
  passwordSchema,
  resetPasswordSchema,
  verifyPassword,
} from "../src/lib/password";
import { addMinutes } from "../src/lib/time";

describe("password hashing", () => {
  it("verifies the original password only", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(
      true,
    );
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash for the same password", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");
    expect(first).not.toBe(second);
  });
});

describe("time helpers", () => {
  it("adds minutes and wraps around midnight", () => {
    expect(addMinutes("09:00", 25)).toBe("09:25");
    expect(addMinutes("23:50", 25)).toBe("00:15");
  });
});

describe("password policy", () => {
  it("should accept 10-128 char passwords and reject 9", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(passwordSchema.safeParse("Password123!").success).toBe(true);
    // Same shape as the smoke password: 18 random bytes as base64url, no symbols.
    expect(passwordSchema.safeParse("aB3dE6gH9jK2mN5pQ8sT1vW4").success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(10)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(128)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(9)).success).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
  });

  it("should reject a new password equal to the current one", () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: "Password123!", newPassword: "Password123!" }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({ currentPassword: "Password123!", newPassword: "Different456!" }).success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({ currentPassword: "Password123!", newPassword: "short" }).success,
    ).toBe(false);
  });

  it("should accept only newPassword on admin reset", () => {
    expect(resetPasswordSchema.safeParse({ newPassword: "Password123!" }).success).toBe(true);
    expect(
      resetPasswordSchema.safeParse({ newPassword: "Password123!", role: "admin" }).success,
    ).toBe(false);
    expect(resetPasswordSchema.safeParse({}).success).toBe(false);
  });
});
