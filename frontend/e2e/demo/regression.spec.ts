import { expect, test } from "@playwright/test";
import { createSeedSchool } from "../../app/lib/school/seed";
import {
  assertNoPageErrors,
  collectPageErrors,
  downloadBytes,
  expectNotice,
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

  /**
   * D3 keeps the legacy local upgrade: a snapshot saved before `assignments` existed still gains the
   * demo homework in local mode (the API cache must never, so `upgrade()` branches on `dataSource`).
   */
  test("fills the shared homework into an older local snapshot", async ({ page }) => {
    const older = createSeedSchool("2026-01-01T00:00:00.000Z");
    const collections: Record<string, unknown> = { ...older.collections };
    delete collections.assignments;
    const payload = JSON.stringify({ ...older, collections });

    await page.addInitScript((raw) => {
      window.localStorage.setItem("lumina-school:v1", raw);
    }, payload);

    await page.goto("/");
    await page.locator('input[type="email"]').fill("student@lumina.school");
    await page.locator('input[type="password"]').fill("demo-pass");
    await page.locator('button[type="submit"]').click();

    await nav(page, "Assignments");
    const cards = page.locator(".student-assignment-card");
    await expect(cards.first()).toBeVisible();
    await expect(
      cards.filter({ hasText: "Audio recording: 2-minute elevator pitch" }),
      "the missing collection is filled from the demo seed in local mode",
    ).toHaveCount(1);
  });

  /** D3 hides the reset control in API mode only; local mode must still reseed on demand. */
  test("resets the demo school from settings", async ({ page }) => {
    const sentinel = `sentinel-${runId()}`;
    const seeded = createSeedSchool("2026-01-01T00:00:00.000Z");
    const withSentinel = JSON.parse(JSON.stringify(seeded)) as typeof seeded;
    withSentinel.collections.courses[sentinel] = {
      id: sentinel,
      title: `Local edit ${sentinel}`,
      level: "A2-C1",
      summary: "A course only this browser knows about",
      objectives: [],
      status: "published",
      ownerId: sentinel,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    await page.addInitScript((raw) => {
      window.localStorage.setItem("lumina-school:v1", raw);
    }, JSON.stringify(withSentinel));

    await page.goto("/");
    await page.locator('input[type="email"]').fill("admin@lumina.school");
    await page.locator('input[type="password"]').fill("demo-pass");
    await page.locator('button[type="submit"]').click();

    await nav(page, "Settings");
    const reset = page.locator('button:has-text("Reset demo")');
    await expect(reset, "local mode keeps the reset control").toBeVisible();
    await reset.click();
    await page.locator('.inline-confirm button:has-text("Reset now")').click();
    await expectNotice(page, "The demo school was reset.");

    const after = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("lumina-school:v1") ?? "{}"),
    ) as { seededAt: string; collections: { courses: Record<string, unknown>; assignments: Record<string, unknown> } };
    expect(Object.keys(after.collections.courses), "the local edit is gone").not.toContain(sentinel);
    expect(after.collections.courses, "the demo school is back").toHaveProperty("course-core-1to1");
    expect(Object.keys(after.collections.assignments).length, "homework is re-seeded").toBeGreaterThan(0);
    expect(after.seededAt, "the snapshot was re-created").not.toBe("2026-01-01T00:00:00.000Z");
  });
});
