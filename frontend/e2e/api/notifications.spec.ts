import { expect, test } from "@playwright/test";
import { signIn } from "../support/auth";
import { notificationState, saveNotificationState } from "../support/api";
import { expectNotice, nav } from "../support/fixtures";
import { ensurePreconditions } from "../support/preconditions";

/**
 * Read and mute state live in `notification_state` per user. These tests clear
 * that state through the API, drive the UI, then restore the original values so
 * the shared dev database is left as it was found.
 */
test.describe("API mode notifications", () => {
  test.beforeAll(async () => {
    await ensurePreconditions();
  });

  test("mark all as read persists to the server and survives a reload", async ({ page }) => {
    const { adminToken } = await ensurePreconditions();
    const original = await notificationState(adminToken);

    try {
      await saveNotificationState(adminToken, { readIds: [] });

      await signIn(page, "admin@lumina.school");
      const bell = page.locator('button[aria-label="Notifications"]');
      await bell.click();

      const panel = page.locator(".notification-panel");
      await expect(panel).toBeVisible();
      await expect(panel.locator(".notification-item").first()).toBeVisible();
      await expect(panel.locator(".notification-item.unread").first()).toBeVisible();

      await panel.locator('button:has-text("Mark all as read")').click();
      await expect
        .poll(async () => (await notificationState(adminToken)).readIds.length)
        .toBeGreaterThan(0);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(bell).toBeVisible();
      await bell.click();
      await expect(page.locator(".notification-panel .notification-item.unread")).toHaveCount(0);
    } finally {
      await saveNotificationState(adminToken, { readIds: original.readIds });
    }
  });

  test("muting a notification category persists per user", async ({ page }) => {
    const { adminToken } = await ensurePreconditions();
    const original = await notificationState(adminToken);
    const categoryRow = () =>
      page
        .locator(".toggle-row")
        .filter({ hasText: "Students running low on credits" })
        .locator('input[type="checkbox"]');

    try {
      await saveNotificationState(adminToken, { mutedCategories: [] });

      await signIn(page, "admin@lumina.school");
      await nav(page, "Settings");

      const toggle = categoryRow();
      await expect(toggle).toBeVisible();
      await expect(toggle).toBeChecked();

      await toggle.click();
      await expectNotice(page, /Notifications turned off/i);
      await expect
        .poll(async () => (await notificationState(adminToken)).mutedCategories)
        .toContain("credits");

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator('button[aria-label="Notifications"]')).toBeVisible();
      await nav(page, "Settings");
      await expect(categoryRow()).not.toBeChecked();
    } finally {
      await saveNotificationState(adminToken, { mutedCategories: original.mutedCategories });
    }
  });
});
