import { describe, expect, test } from "vitest";
import { readSetPasswordToken } from "@/app/lib/auth/invite-hash";

const token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd"; // 42 chars, base64url alphabet

describe("readSetPasswordToken", () => {
  test("should accept only a well-formed #set-password hash", () => {
    expect(readSetPasswordToken(`#set-password=${token}`)).toBe(token);
  });

  test("rejects a missing or different prefix", () => {
    expect(readSetPasswordToken("")).toBeNull();
    expect(readSetPasswordToken(token)).toBeNull();
    expect(readSetPasswordToken(`#reset-password=${token}`)).toBeNull();
    expect(readSetPasswordToken(`set-password=${token}`)).toBeNull();
  });

  test("enforces 20-128 characters", () => {
    expect(readSetPasswordToken(`#set-password=${"a".repeat(19)}`)).toBeNull();
    expect(readSetPasswordToken(`#set-password=${"a".repeat(20)}`)).toBe("a".repeat(20));
    expect(readSetPasswordToken(`#set-password=${"a".repeat(128)}`)).toBe("a".repeat(128));
    expect(readSetPasswordToken(`#set-password=${"a".repeat(129)}`)).toBeNull();
  });

  test("rejects bad characters and extra parameters", () => {
    expect(readSetPasswordToken(`#set-password=${token.slice(0, 30)}+/=`)).toBeNull();
    expect(readSetPasswordToken(`#set-password=${token}%20`)).toBeNull();
    expect(readSetPasswordToken(`#set-password=${token}&next=/admin`)).toBeNull();
    expect(readSetPasswordToken(`#set-password=${token}#again`)).toBeNull();
    expect(readSetPasswordToken(`#set-password=${token}&set-password=${token}`)).toBeNull();
  });
});
