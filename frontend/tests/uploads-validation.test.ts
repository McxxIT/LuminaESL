import { describe, expect, test } from "vitest";
import { ACCEPTED, MAX_UPLOAD_BYTES, validateUploadFile } from "@/app/lib/school/files";

function fileOf(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("shared upload validator (plan uploads and library items)", () => {
  test("accepts PDF, images, Word and PowerPoint up to 5 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
    for (const type of [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
    ]) {
      expect(ACCEPTED.test(type)).toBe(true);
      expect(validateUploadFile(fileOf("ok", type, MAX_UPLOAD_BYTES))).toBeUndefined();
    }
  });

  test("rejects a file over the cap with its name in the message", () => {
    expect(validateUploadFile(fileOf("big.pdf", "application/pdf", MAX_UPLOAD_BYTES + 1))).toBe("big.pdf is larger than 5 MB.");
  });

  test("rejects other types with one message", () => {
    for (const type of ["text/plain", "application/zip", "video/mp4", ""]) {
      expect(validateUploadFile(fileOf("x", type, 10))).toBe("Upload a PDF, image, Word, or PowerPoint file.");
    }
  });

  test("checks the size before the type", () => {
    expect(validateUploadFile(fileOf("big.zip", "application/zip", MAX_UPLOAD_BYTES + 1))).toBe("big.zip is larger than 5 MB.");
  });
});
