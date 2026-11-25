import { createHash, randomBytes } from "node:crypto";

/** Bytes of entropy in an opaque single-use token (256 bits). */
export const TOKEN_BYTES = 32;

/** sha256 hex digest of an opaque token; only this digest is ever stored. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A fresh 32-byte random token, base64url encoded (43 characters). */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}
