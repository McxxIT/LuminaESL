import { expect, test } from "@playwright/test";
import {
  assertNoPageErrors,
  collectPageErrors,
  downloadBytes,
  nav,
  pdfBuffer,
  runId,
  writeFixture,
} from "../support/fixtures";
import { openEditableCourse } from "../support/flows";

/**
 * Demo-mode regression: with the browser store in charge, sign-in must accept a
 * demo password, uploads must round-trip through IndexedDB, and read/mute state
 * must persist in localStorage. No request may reach the API.
 */
test.describe("Demo mode regression", () => {
  test("keeps the local school store working end to end", async ({ page }, testInfo) => {
    const pageErrors = collectPageErrors(page);
    const marker = runId();
    const fileName = `demo-plan-${marker}.pdf`;
    const bytes = pdfBuffer(marker);
    const filePath = await writeFixture(testInfo, fileName, bytes);

    const apiCalls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/")) apiCalls.push(request.url());
    });

    await page.goto("/");
    await page.locator('input[type="email"]').fill("manager@lumina.school");
    await page.locator('input[type="password"]').fill("demo-pass");
    await page.locator('button[type="submit"]').click();

    const bell = page.locator('button[aria-label="Notifications"]');
    await expect(bell).toBeVisible();

    const storage = await page.evaluate(() => ({
      school: Boolean(window.localStorage.getItem("lumina-school:v1")),
      account: Boolean(window.localStorage.getItem("lumina-account")),
    }));
    expect(storage.school, "demo mode seeds the local school snapshot").toBe(true);
    expect(storage.account, "demo mode restores the signed-in account").toBe(true);

    await openEditableCourse(page);
    await page.locator(".course-plan-main").first().click();
    await expect(page.locator(".plan-files").first()).toBeVisible();

    await page.locator('.plan-upload input[type="file"]').setInputFiles(filePath);
    const row = page.locator(".plan-file-name", { hasText: fileName }).first();
    await expect(row).toBeVisible();

    const downloadEvent = page.waitForEvent("download");
    await row.click();
    const downloaded = await downloadBytes(await downloadEvent);
    expect(downloaded.equals(bytes), "IndexedDB returns the stored bytes").toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.locator(".modal-backdrop")).toHaveCount(0);

    await bell.click();
    const panel = page.locator(".notification-panel");
    await expect(panel).toBeVisible();
    const unread = panel.locator(".notification-item.unread");
    if ((await unread.count()) > 0) {
      await panel.locator('button:has-text("Mark all as read")').click();
    }
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Object.keys(window.localStorage).filter((key) =>
              key.startsWith("lumina-notifications-read:"),
            ).length,
        ),
      )
      .toBeGreaterThan(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page.locator(".notification-panel .notification-item.unread")).toHaveCount(0);

    await nav(page, "Settings");
    const muteRow = () =>
      page
        .locator(".toggle-row")
        .filter({ hasText: "Students running low on credits" })
        .locator('input[type="checkbox"]');
    const toggle = muteRow();
    await expect(toggle).toBeVisible();
    if (await toggle.isChecked()) await toggle.click();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(bell).toBeVisible();
    await nav(page, "Settings");
    await expect(muteRow()).not.toBeChecked();

    expect(apiCalls, "demo mode must not call the API").toEqual([]);
    assertNoPageErrors(pageErrors);
  });
});
