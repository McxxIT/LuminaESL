import { expect, test } from "@playwright/test";
import { apiCall, apiLogin, archiveUser, createDisposableUser } from "../support/api";
import { signIn, signOut, waitForApi } from "../support/auth";
import { assertNoPageErrors, collectPageErrors, expectNotice, nav, runId } from "../support/fixtures";
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

/**
 * Phase 03 password lifecycle. Both tests run on a disposable manager created
 * through the admin API and archived in `finally`, so no seeded password changes.
 * The Playwright backend runs with AUTH_RATE_LIMIT_MAX=100000; any auth 429 here
 * means that override did not reach it.
 */
test.describe("API mode password lifecycle", () => {
  test.beforeAll(async () => {
    await ensurePreconditions();
  });

  async function disposableManager(label: string) {
    const marker = runId();
    const password = `E2e-start-${marker}`;
    const email = `e2e-${label}-${marker}@e2e.lumina.test`;
    const name = `E2E ${label} ${marker}`;
    const adminToken = await apiLogin("admin@lumina.school");
    const user = await createDisposableUser(adminToken, { name, email, password, role: "manager" });
    return { user, email, name, password, marker };
  }

  async function cleanUp(userId: string) {
    // Fresh admin login: an access token from the start of the test may have expired.
    const adminToken = await apiLogin("admin@lumina.school");
    await archiveUser(adminToken, userId);
  }

  test("changes the password from Settings and keeps this device signed in", async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    const account = await disposableManager("pwchange");
    const nextPassword = `E2e-next-${account.marker}`;
    const authStatuses: { url: string; status: number }[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/v1/auth/")) authStatuses.push({ url: response.url(), status: response.status() });
    });

    try {
      const session = await signIn(page, account.email, account.password);
      expect(session.login, "POST /auth/login").toBe(200);
      await nav(page, "Settings");
      const card = page.getByTestId("password-change-card");
      await expect(card).toBeVisible();

      // Wrong current password: inline error, still signed in, no refresh retry.
      const refreshesBefore = authStatuses.filter((entry) => entry.url.includes("/auth/refresh")).length;
      await card.locator('input[name="current-password"]').fill("not-my-password-at-all");
      await card.locator('input[name="new-password"]').fill(nextPassword);
      await card.locator('input[name="confirm-password"]').fill(nextPassword);
      const wrong = waitForApi(page, "/auth/change-password", "POST");
      await card.locator('button[type="submit"]').click();
      const wrongResponse = await wrong;
      expect(wrongResponse.status(), "wrong current password is a 400, never 401").toBe(400);
      expect(((await wrongResponse.json()) as { error: { code: string } }).error.code).toBe("INVALID_CURRENT_PASSWORD");
      await expect(card.locator('[role="alert"]')).toContainText("current password is incorrect");
      await expect(page.locator("button.nav-item").first()).toBeVisible();
      expect(
        authStatuses.filter((entry) => entry.url.includes("/auth/refresh")).length,
        "a wrong current password must not trigger /auth/refresh",
      ).toBe(refreshesBefore);

      // Correct change.
      await card.locator('input[name="current-password"]').fill(account.password);
      const ok = waitForApi(page, "/auth/change-password", "POST");
      await card.locator('button[type="submit"]').click();
      expect((await ok).status(), "POST /auth/change-password").toBe(200);
      await expectNotice(page, "Password changed");
      await expect(page.locator("button.nav-item").first()).toBeVisible();

      expect(await signOut(page), "POST /auth/logout").toBe(200);
      expect((await apiCall("/auth/login", { method: "POST", body: { email: account.email, password: account.password } })).status, "old password").toBe(401);
      const again = await signIn(page, account.email, nextPassword);
      expect(again.login, "new password signs in").toBe(200);

      expect(authStatuses.filter((entry) => entry.status === 429), "no auth rate-limit hits").toEqual([]);
      assertNoPageErrors(pageErrors);
    } finally {
      await cleanUp(account.user.id);
    }
  });

  test("lets an admin reset another account's password", async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    const account = await disposableManager("pwreset");
    const resetPassword = `E2e-reset-${account.marker}`;
    const authLimited: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/v1/") && response.status() === 429) authLimited.push(response.url());
    });

    try {
      await signIn(page, "admin@lumina.school");
      await nav(page, "Managers");
      const managerCard = page.locator("article.manager-card").filter({ hasText: account.name });
      await expect(managerCard).toBeVisible();
      await managerCard.locator('button:has-text("Reset password")').click();

      const modal = page.locator('[role="dialog"]').filter({ hasText: "RESET PASSWORD" });
      await expect(modal).toContainText("within 15 minutes");
      await modal.locator('input[name="new-password"]').fill(resetPassword);
      await modal.locator('input[name="confirm-password"]').fill(resetPassword);
      const reset = waitForApi(page, `/users/${account.user.id}/reset-password`, "POST");
      await page.locator('button[form="reset-password-form"]').click();
      const resetResponse = await reset;
      expect(resetResponse.status(), "POST /users/:id/reset-password").toBe(200);
      expect(JSON.stringify(await resetResponse.json())).not.toContain(resetPassword);
      await expectNotice(page, "password was reset");

      expect((await apiCall("/auth/login", { method: "POST", body: { email: account.email, password: account.password } })).status, "old password").toBe(401);
      expect((await apiCall("/auth/login", { method: "POST", body: { email: account.email, password: resetPassword } })).status, "new password").toBe(200);

      expect(authLimited, "no rate-limit hits").toEqual([]);
      assertNoPageErrors(pageErrors);
    } finally {
      await cleanUp(account.user.id);
    }
  });
});
