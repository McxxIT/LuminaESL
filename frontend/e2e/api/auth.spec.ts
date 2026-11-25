import { expect, test } from "@playwright/test";
import { signIn, signOut } from "../support/auth";
import { assertNoPageErrors, collectPageErrors } from "../support/fixtures";
import { ensurePreconditions } from "../support/preconditions";

/**
 * Login is the entry point of every other flow: these tests prove the browser
 * session is backed by the API (not the demo store) and that it ends cleanly.
 */
test.describe("API mode authentication", () => {
  test.beforeAll(async () => {
    await ensurePreconditions();
  });

  test("signs in through the API and bootstraps the school", async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    const session = await signIn(page, "admin@lumina.school");
    expect(session.login, "POST /auth/login").toBe(200);
    expect(session.bootstrap, "GET /school/bootstrap").toBe(200);

    await expect(page.locator("button.nav-item", { hasText: "Curriculum" })).toBeVisible();
    await expect(page.locator(".auth-form")).toHaveCount(0);

    const storage = await page.evaluate(() => ({
      keys: Object.keys(window.localStorage),
      cookie: document.cookie,
    }));
    expect(
      storage.keys.filter((key) => /token|jwt|access/i.test(key)),
      "access tokens must not be readable by scripts",
    ).toEqual([]);
    expect(storage.cookie, "refresh cookie must stay httpOnly").not.toContain("refresh_token");

    assertNoPageErrors(pageErrors);
  });

  test("rejects a wrong password and keeps the login form", async ({ page }) => {
    await page.goto("/");
    await page.locator('input[type="email"]').fill("admin@lumina.school");
    await page.locator('input[type="password"]').fill("definitely-not-the-password");
    await page.locator('button[type="submit"]').click();

    const alert = page.locator('[role="alert"]').first();
    await expect(alert).toBeVisible();
    await expect(alert).not.toHaveText(/^\s*$/);

    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator("button.nav-item")).toHaveCount(0);
  });

  test("signs out and does not resume the session after a reload", async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await signIn(page, "manager@lumina.school");
    const logoutStatus = await signOut(page);
    expect(logoutStatus, "POST /auth/logout").toBe(200);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator("button.nav-item")).toHaveCount(0);

    assertNoPageErrors(pageErrors);
  });
});
