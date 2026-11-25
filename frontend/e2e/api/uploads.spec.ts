import { expect, test } from "@playwright/test";
import { API_BASE, apiCall, apiGet, apiLogin } from "../support/api";
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

  test("enforces upload download scoping and staff-managed credits in API mode", async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    const marker = runId();
    const bytes = pdfBuffer(marker);

    const [adminToken, managerToken, manager2Token, studentToken] = await Promise.all([
      apiLogin("admin@lumina.school"),
      apiLogin("manager@lumina.school"),
      apiLogin("manager2@lumina.school"),
      apiLogin("student@lumina.school"),
    ]);
    const me = await apiGet<{ user: { id: string } }>("/auth/me", studentToken);

    // Upload a private (unattached) file as manager@; only uploader and admin can access it.
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), `scoped-${marker}.pdf`);
    const uploadRes = await fetch(`${API_BASE}/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${managerToken}` },
      body: form,
    });
    expect(uploadRes.status, "manager POST /uploads").toBe(201);
    const uploaded = (await uploadRes.json()) as { id: string };

    expect((await apiCall(`/uploads/${uploaded.id}`, { token: managerToken })).status).toBe(200);
    expect((await apiCall(`/uploads/${uploaded.id}`, { token: adminToken })).status).toBe(200);
    expect((await apiCall(`/uploads/${uploaded.id}`, { token: manager2Token })).status).toBe(403);
    expect((await apiCall(`/uploads/${uploaded.id}/download`, { token: manager2Token })).status).toBe(403);
    expect((await apiCall(`/uploads/${uploaded.id}`, { token: studentToken })).status).toBe(403);
    expect((await apiCall(`/uploads/${uploaded.id}/download`, { token: studentToken })).status).toBe(403);

    // Student cannot self-purchase credits via POST /credits in API mode.
    const selfPurchase = await apiCall("/credits", {
      method: "POST",
      token: studentToken,
      body: {
        studentId: me.user.id,
        hours: 5,
        reason: "purchase",
        description: "Blocked self-purchase",
      },
    });
    expect(selfPurchase.status, "student POST /credits").toBe(403);

    // Student Billing UI hides Buy credits and demo card in API mode.
    await signIn(page, "student@lumina.school");
    await page.getByRole("button", { name: /Billing/i }).first().click();
    await expect(page.getByText("School-managed credits")).toBeVisible();
    await expect(page.getByRole("button", { name: /Buy credits/i })).toHaveCount(0);
    await expect(page.getByText("•••• •••• •••• 4242")).toHaveCount(0);

    assertNoPageErrors(pageErrors);
  });
});
