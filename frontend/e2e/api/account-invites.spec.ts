import { expect, test, type Page } from "@playwright/test";
import { apiLogin, archiveUser, bootstrap, userByEmail } from "../support/api";
import { signIn, waitForApi } from "../support/auth";
import { assertNoPageErrors, collectPageErrors, nav, runId } from "../support/fixtures";
import { ensurePreconditions } from "../support/preconditions";

/**
 * Account invitations (API mode, backend on the `log` mailer with no resend
 * cooldown). Nothing is emailed: an admin reads the link from the invite
 * result; a manager never receives a link at all.
 */

async function openInviteLink(page: Page, appOrigin: string, link: string): Promise<string> {
  // Use the fragment with the app under test, whatever base URL the backend was configured with.
  const hash = link.slice(link.indexOf("#"));
  await page.goto(`${appOrigin}/${hash}`);
  await expect(page.getByTestId("set-password-form")).toBeVisible();
  return hash;
}

async function fillPasswords(page: Page, password: string, confirm = password): Promise<void> {
  await page.getByLabel("New password").fill(password);
  await page.getByLabel("Confirm password").fill(confirm);
  await page.getByTestId("set-password-form").locator('button[type="submit"]').click();
}

test.describe("API mode account invitations", () => {
  test.beforeAll(async () => {
    await ensurePreconditions();
  });

  test("admin invites a teacher who sets a password and signs in", async ({ page, browser }) => {
    const pageErrors = collectPageErrors(page);
    const marker = runId();
    const name = `Invited Teacher ${marker}`;
    const email = `e2e-invite-${marker}@lumina.test`;
    const newPassword = `Invite-${marker}-pass`;
    const adminToken = await apiLogin("admin@lumina.school");
    let teacherId: string | undefined;

    try {
      await signIn(page, "admin@lumina.school");
      const appOrigin = new URL(page.url()).origin;
      await nav(page, "Teachers");
      await page.locator("button.primary-button", { hasText: "Add teacher" }).click();
      const form = page.locator("#teacher-form");
      await expect(form.locator('input[type="password"]')).toHaveCount(0);
      await form.getByLabel("Full name").fill(name);
      await form.getByLabel("Email", { exact: true }).fill(email);
      await form.getByLabel("Headline").fill("Invited by e2e");
      const created = waitForApi(page, "/api/v1/users", "POST");
      await page.locator('button[type="submit"][form="teacher-form"]').click();
      expect((await created).status(), "POST /users").toBe(201);

      const result = page.getByTestId("invite-result");
      await expect(result).toBeVisible();
      await expect(result).toContainText("Email sending is not configured");
      const link = await page.getByTestId("invite-link").inputValue();
      expect(link).toContain("#set-password=");
      await page.locator(".modal-footer button", { hasText: "Done" }).click();

      teacherId = userByEmail(await bootstrap(adminToken), email).id;
      const row = page.locator("button.manager-table-row", { hasText: name });
      await expect(row).toContainText("Invited");
      await row.click();
      await expect(page.getByTestId("invite-row-resend")).toBeVisible();
      const footer = page.locator(".modal-footer");
      await expect(footer.getByText("Pause")).toHaveCount(0);
      await expect(footer.getByText("Reset password")).toHaveCount(0);
      await page.keyboard.press("Escape");

      // The invitee opens the link in a fresh browser.
      const context = await browser.newContext();
      const invitee = await context.newPage();
      const inviteeErrors = collectPageErrors(invitee);
      const hash = await openInviteLink(invitee, appOrigin, link);

      await fillPasswords(invitee, newPassword, `${newPassword}x`);
      await expect(invitee.getByTestId("set-password-error")).toContainText("do not match");
      await fillPasswords(invitee, "short1234");
      await expect(invitee.getByTestId("set-password-error")).toContainText("10 to 128");

      const accepted = waitForApi(invitee, "/auth/set-password", "POST");
      await fillPasswords(invitee, newPassword);
      expect((await accepted).status(), "POST /auth/set-password").toBe(204);
      await expect(invitee.getByTestId("set-password-success")).toBeVisible();
      expect(new URL(invitee.url()).hash, "the token left the address bar").toBe("");

      await invitee.getByRole("button", { name: /Continue to sign in/ }).click();
      await expect(invitee.locator('input[type="email"]')).toBeVisible();
      const session = await signIn(invitee, email, newPassword);
      expect(session.login).toBe(200);
      await expect(invitee.locator("button.nav-item").first()).toBeVisible();
      assertNoPageErrors(inviteeErrors);
      await context.close();

      // The used link is dead.
      const second = await browser.newContext();
      const reuse = await second.newPage();
      await reuse.goto(`${appOrigin}/${hash}`);
      await expect(reuse.getByTestId("set-password-form")).toBeVisible();
      await fillPasswords(reuse, `${newPassword}-again`);
      await expect(reuse.getByTestId("set-password-error")).toContainText("invalid or has expired");
      await second.close();

      assertNoPageErrors(pageErrors);
    } finally {
      if (teacherId) await archiveUser(adminToken, teacherId);
    }
  });

  test("manager invites a student and resends without ever seeing a link", async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    const marker = runId();
    const name = `Invited Student ${marker}`;
    const email = `e2e-invite-student-${marker}@lumina.test`;
    const adminToken = await apiLogin("admin@lumina.school");
    let studentId: string | undefined;

    try {
      await signIn(page, "manager@lumina.school");
      await nav(page, "Students");
      await page.locator("button.primary-button", { hasText: "Add student" }).click();
      const form = page.locator("#student-form");
      await form.getByLabel("Full name").fill(name);
      await form.getByLabel("Email", { exact: true }).fill(email);
      await form.getByLabel("Learning goal").fill("Invited by e2e");
      const created = waitForApi(page, "/api/v1/users", "POST");
      await page.locator('button[type="submit"][form="student-form"]').click();
      expect((await created).status(), "POST /users as a manager").toBe(201);

      await expect(page.getByTestId("invite-result")).toBeVisible();
      await expect(page.getByTestId("invite-link")).toHaveCount(0);
      await page.locator(".modal-footer button", { hasText: "Done" }).click();

      studentId = userByEmail(await bootstrap(adminToken), email).id;
      const row = page.locator("button.manager-table-row", { hasText: name });
      await expect(row).toContainText("Invited");
      await row.click();
      const resent = waitForApi(page, "/invite", "POST");
      await page.getByTestId("invite-row-resend").click();
      expect((await resent).status(), "POST /users/:id/invite as a manager").toBe(200);
      await expect(page.getByTestId("invite-result")).toBeVisible();
      await expect(page.getByTestId("invite-link")).toHaveCount(0);
      await expect(page.locator('input[type="password"]')).toHaveCount(0);

      assertNoPageErrors(pageErrors);
    } finally {
      if (studentId) await archiveUser(adminToken, studentId);
    }
  });

  test("shows the invalid-link message for an unknown token", async ({ page }) => {
    await page.goto("/#set-password=ThisTokenDoesNotExist_0123456789abcdef");
    await expect(page.getByTestId("set-password-form")).toBeVisible();
    await fillPasswords(page, "a-valid-password-123");
    await expect(page.getByTestId("set-password-error")).toContainText("invalid or has expired");
  });
});
