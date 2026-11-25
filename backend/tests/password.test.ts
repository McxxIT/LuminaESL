import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/password";
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
