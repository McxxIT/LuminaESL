import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveUploadPath } from "../src/lib/upload-path";

const root = path.resolve("lumina-test-uploads");

describe("resolveUploadPath (native path semantics)", () => {
  it("keeps a server-generated uuid key inside the upload directory", () => {
    const key = "3f1c2a9e-1b2c-4d5e-8f90-123456789abc.pdf";
    expect(resolveUploadPath(root, key)).toBe(path.join(root, key));
  });

  it("keeps a nested relative key inside the upload directory", () => {
    expect(resolveUploadPath(root, "a/b.pdf")).toBe(path.join(root, "a", "b.pdf"));
  });

  it("keeps a name that merely starts with two dots", () => {
    expect(resolveUploadPath(root, "..hidden.pdf")).toBe(
      path.join(root, "..hidden.pdf"),
    );
  });

  it("returns null for a key that climbs out with ..", () => {
    expect(resolveUploadPath(root, "../.env")).toBeNull();
  });

  it("returns null for a key that climbs out after a nested segment", () => {
    expect(resolveUploadPath(root, "a/../../.env")).toBeNull();
  });

  it("returns null for an absolute POSIX path", () => {
    expect(resolveUploadPath(root, "/etc/passwd")).toBeNull();
  });

  it("returns null for an empty key (the directory itself)", () => {
    expect(resolveUploadPath(root, "")).toBeNull();
  });

  it("returns null for a dot key (the directory itself)", () => {
    expect(resolveUploadPath(root, ".")).toBeNull();
  });

  it("returns null for a sibling directory that shares the name prefix", () => {
    const upDir = path.resolve("up");
    expect(resolveUploadPath(upDir, "../up-evil/x")).toBeNull();
  });

  it("returns null for a key containing a NUL byte", () => {
    expect(resolveUploadPath(root, "a\0.pdf")).toBeNull();
  });
});

describe("resolveUploadPath (Windows path semantics via path.win32)", () => {
  const winRoot = "C:\\Up";
  const win = path.win32;

  it("returns null for a drive-letter absolute key", () => {
    expect(resolveUploadPath(winRoot, "C:\\Windows\\win.ini", win)).toBeNull();
  });

  it("returns null for a UNC key", () => {
    expect(resolveUploadPath(winRoot, "\\\\server\\share\\x", win)).toBeNull();
  });

  it("returns null for a backslash traversal key", () => {
    expect(resolveUploadPath(winRoot, "..\\x", win)).toBeNull();
  });

  it("returns null for a nested backslash traversal key", () => {
    expect(resolveUploadPath(winRoot, "a\\..\\..\\x", win)).toBeNull();
  });

  it("returns null for a mixed-separator traversal key", () => {
    expect(resolveUploadPath(winRoot, "a/..\\..\\x", win)).toBeNull();
  });

  it("returns null for a sibling directory that shares the name prefix", () => {
    expect(resolveUploadPath(winRoot, "..\\Up-evil\\x", win)).toBeNull();
  });

  it("keeps a plain key inside the directory", () => {
    expect(resolveUploadPath(winRoot, "a.pdf", win)).toBe("C:\\Up\\a.pdf");
  });
});
