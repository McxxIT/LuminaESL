import { expect, test } from "@playwright/test";
import { signIn } from "../support/auth";
import {
  assertNoPageErrors,
  collectPageErrors,
  downloadBytes,
  pdfBuffer,
  runId,
  writeFixture,
} from "../support/fixtures";
import { openEditableCourse, uploadPlanFile } from "../support/flows";
import { ensurePreconditions } from "../support/preconditions";

/**
 * Uploads go to `POST /uploads` and downloads come back through the
 * authenticated `/uploads/:id/download` route, so the byte comparison proves
 * PostgreSQL plus object storage round-trip the real file.
 */
test.describe("API mode uploads", () => {
  test.beforeAll(async () => {
    await ensurePreconditions();
  });

  test("uploads a plan file and downloads identical bytes", async ({ page }, testInfo) => {
    const pageErrors = collectPageErrors(page);
    const marker = runId();
    const fileName = `plan-${marker}.pdf`;
    const bytes = pdfBuffer(marker);
    const filePath = await writeFixture(testInfo, fileName, bytes);

    await signIn(page, "admin@lumina.school");

    const course = await openEditableCourse(page);
    expect(course.length, "course label").toBeGreaterThan(0);

    const upload = await uploadPlanFile(page, filePath);
    expect(upload.status, "POST /uploads").toBe(201);
    expect(upload.body.name).toBe(fileName);
    expect(upload.body.size).toBe(bytes.length);
    expect(upload.body.id).toBeTruthy();

    const row = page.locator(".plan-file-name", { hasText: fileName }).first();
    await expect(row).toBeVisible();

    const downloadEvent = page.waitForEvent("download");
    await row.click();
    const downloaded = await downloadBytes(await downloadEvent);
    expect(
      downloaded.equals(bytes),
      `downloaded ${downloaded.length} bytes, uploaded ${bytes.length}`,
    ).toBe(true);

    assertNoPageErrors(pageErrors);
  });
});
