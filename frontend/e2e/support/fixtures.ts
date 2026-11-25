import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Download, type Page, type TestInfo } from "@playwright/test";

/** Unique per run so created rows and file names never collide with older runs. */
export function runId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * A tiny PDF with the run id embedded, so a byte comparison proves the bytes
 * came back from this upload rather than a seed file with a similar name.
 */
export function pdfBuffer(label: string): Buffer {
  const body = [
    "%PDF-1.4",
    "% Lumina parity suite fixture",
    `% label: ${label}`,
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj",
    "trailer<</Root 1 0 R>>",
    "%%EOF",
    "",
  ].join("\n");
  return Buffer.from(body, "latin1");
}

/** 8x8 PNG used as cancellation evidence. */
export function pngBuffer(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVQoU2NkYGD4z0AEYBxVSFIUjSocVUg8AQAxJQABlZ4nRwAAAABJRU5ErkJggg==",
    "base64",
  );
}

export async function downloadBytes(download: Download): Promise<Buffer> {
  const filePath = await download.path();
  if (!filePath) throw new Error(`Download ${download.suggestedFilename()} has no local path`);
  return readFile(filePath);
}

/** Writes a fixture file under the test's output folder (gitignored). */
export async function writeFixture(
  testInfo: TestInfo,
  name: string,
  bytes: Buffer,
): Promise<string> {
  const target = testInfo.outputPath(name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return target;
}

/** Collects uncaught page errors; assert `[]` at the end of a flow. */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

/** Sidebar navigation is a SPA: every route is a `button.nav-item`. */
export async function nav(page: Page, label: string): Promise<void> {
  const item = page
    .locator("button.nav-item")
    .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`) })
    .first();
  await item.click();
}

/** Escape a label before using it inside a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Toast stack rendered by `LuminaApp`; every mutation surfaces one. */
export async function expectNotice(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator(".toast")).toContainText(text);
}

export function assertNoPageErrors(errors: string[]): void {
  expect(errors, "uncaught page errors").toEqual([]);
}
