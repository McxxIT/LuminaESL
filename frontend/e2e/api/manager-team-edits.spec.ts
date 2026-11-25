import { expect, test, type Page } from "@playwright/test";
import {
  SEEDED_PASSWORD,
  apiLogin,
  apiPost,
  archiveUser,
  bootstrap,
  userByEmail,
  type ApiUser,
} from "../support/api";
import { signIn, waitForApi } from "../support/auth";
import { assertNoPageErrors, collectPageErrors, nav, runId } from "../support/fixtures";
import { ensurePreconditions } from "../support/preconditions";

/**
 * Managers edit their own team (API mode, `log` mailer, no resend cooldown):
 * rename and pause/reactivate work, the Email field is locked for a manager,
 * and an admin changing an invited person's email re-issues the invitation.
 */

type CreatedUser = ApiUser & { invite?: { sent: boolean; mode: string; link?: string } };

async function managerIdOf(adminToken: string): Promise<string> {
  return userByEmail(await bootstrap(adminToken), "manager@lumina.school").id;
}

function hashOf(link: string): string {
  return link.slice(link.indexOf("#"));
}

async function openTeamMember(page: Page, name: string): Promise<void> {
  const row = page.locator("button.manager-table-row", { hasText: name }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator(".modal-footer")).toBeVisible();
}

async function confirmStatus(page: Page): Promise<void> {
  await page.locator('button[form="status-form"]').click();
}

test.describe("API mode manager team edits", () => {
  test.beforeAll(async () => {
    await ensurePreconditions();
  });

  test("a manager edits and pauses a team teacher", async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    const marker = runId();
    const email = `e2e-team-teacher-${marker}@lumina.test`;
    const name = `Team Teacher ${marker}`;
    const renamed = `Team Teacher Renamed ${marker}`;
    const adminToken = await apiLogin("admin@lumina.school");
    let teacherId: string | undefined;

    try {
      const created = await apiPost<ApiUser>("/users", adminToken, {
        name,
        email,
        password: SEEDED_PASSWORD,
        role: "teacher",
        managerId: await managerIdOf(adminToken),
      });
      teacherId = created.id;

      await signIn(page, "manager@lumina.school");
      await nav(page, "Teachers");
      await openTeamMember(page, name);

      await page.locator('.modal-footer button:has-text("Edit")').click();
      const form = page.locator("#teacher-form");
      const emailInput = form.locator('input[type="email"]');
      await expect(emailInput, "a manager cannot change the address").toBeDisabled();
      await expect(page.getByTestId("email-locked-note")).toContainText("Only an admin can change an email address.");

      await form.getByLabel("Full name").fill(renamed);
      await form.getByLabel("Headline").fill("Edited by the manager");
      const accountPatch = waitForApi(page, `/api/v1/users/${teacherId}`, "PATCH");
      const profilePatch = waitForApi(page, `/api/v1/teachers/${teacherId}`, "PATCH");
      await page.locator('button[type="submit"][form="teacher-form"]').click();
      const [account] = await Promise.all([accountPatch, profilePatch]);
      expect(account.status(), "PATCH /users/:id as the manager").toBe(200);
      const body = JSON.parse(account.request().postData() ?? "{}") as Record<string, unknown>;
      expect(Object.keys(body), "the manager sends the name only").toEqual(["name"]);

      await expect(page.getByRole("dialog", { name: renamed })).toBeVisible();
      await expect(page.locator("button.manager-table-row", { hasText: renamed })).toBeVisible();

      await page.locator('.modal-footer button:has-text("Pause")').click();
      await confirmStatus(page);
      await expect
        .poll(async () => userByEmail(await bootstrap(adminToken), email).status)
        .toBe("paused");

      await page.locator('.modal-footer button:has-text("Reactivate")').click();
      await confirmStatus(page);
      await expect
        .poll(async () => userByEmail(await bootstrap(adminToken), email).status)
        .toBe("active");

      assertNoPageErrors(pageErrors);
    } finally {
      if (teacherId) await archiveUser(adminToken, teacherId);
    }
  });

  test("a manager edits and pauses a team student", async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    const marker = runId();
    const email = `e2e-team-student-${marker}@lumina.test`;
    const name = `Team Student ${marker}`;
    const renamed = `Team Student Renamed ${marker}`;
    const adminToken = await apiLogin("admin@lumina.school");
    let studentId: string | undefined;

    try {
      const created = await apiPost<ApiUser>("/users", adminToken, {
        name,
        email,
        password: SEEDED_PASSWORD,
        role: "student",
        managerId: await managerIdOf(adminToken),
      });
      studentId = created.id;

      await signIn(page, "manager@lumina.school");
      await nav(page, "Students");
      await openTeamMember(page, name);

      await page.locator(".modal-footer").getByRole("button", { name: "Edit", exact: true }).click();
      const form = page.locator("#student-form");
      await expect(form.locator('input[type="email"]').first()).toBeDisabled();
      await expect(page.getByTestId("email-locked-note")).toContainText("Only an admin can change an email address.");

      await form.getByLabel("Full name").fill(renamed);
      await form.getByLabel("Learning goal").fill("Edited by the manager");
      const accountPatch = waitForApi(page, `/api/v1/users/${studentId}`, "PATCH");
      const profilePatch = waitForApi(page, `/api/v1/students/${studentId}`, "PATCH");
      await page.locator('button[type="submit"][form="student-form"]').click();
      const [account] = await Promise.all([accountPatch, profilePatch]);
      expect(account.status(), "PATCH /users/:id as the manager").toBe(200);
      const body = JSON.parse(account.request().postData() ?? "{}") as Record<string, unknown>;
      expect(Object.keys(body), "the manager sends the name only").toEqual(["name"]);

      await expect(page.locator("button.manager-table-row", { hasText: renamed })).toBeVisible();

      await page.locator('.modal-footer button:has-text("Pause")').click();
      await confirmStatus(page);
      await expect
        .poll(async () => userByEmail(await bootstrap(adminToken), email).status)
        .toBe("paused");

      await page.locator('.modal-footer button:has-text("Reactivate")').click();
      await confirmStatus(page);
      await expect
        .poll(async () => userByEmail(await bootstrap(adminToken), email).status)
        .toBe("active");

      assertNoPageErrors(pageErrors);
    } finally {
      if (studentId) await archiveUser(adminToken, studentId);
    }
  });

  test("an admin changing an invited teacher's email re-issues the invitation", async ({ page, browser }) => {
    const pageErrors = collectPageErrors(page);
    const marker = runId();
    const email = `e2e-invited-edit-${marker}@lumina.test`;
    const newEmail = `e2e-invited-edit-new-${marker}@lumina.test`;
    const name = `Invited Edit Teacher ${marker}`;
    const adminToken = await apiLogin("admin@lumina.school");
    let teacherId: string | undefined;

    try {
      const created = await apiPost<CreatedUser>("/users", adminToken, {
        name,
        email,
        role: "teacher",
        managerId: await managerIdOf(adminToken),
      });
      teacherId = created.id;
      expect(created.invite?.link, "the admin receives the first invitation link").toBeTruthy();
      const oldHash = hashOf(created.invite?.link ?? "");

      await signIn(page, "admin@lumina.school");
      const appOrigin = new URL(page.url()).origin;
      await nav(page, "Teachers");
      await openTeamMember(page, name);

      await page.locator('.modal-footer button:has-text("Edit")').click();
      const form = page.locator("#teacher-form");
      await expect(form.locator('input[type="email"]').first(), "an admin may change the address").toBeEnabled();
      await expect(page.getByTestId("email-invite-note")).toContainText(
        "Changing the email sends a new invitation to the new address.",
      );

      await form.locator('input[type="email"]').first().fill(newEmail);
      const changed = waitForApi(page, `/api/v1/users/${teacherId}`, "PATCH");
      await page.locator('button[type="submit"][form="teacher-form"]').click();
      expect((await changed).status(), "admin PATCH on an invited person").toBe(200);

      await expect(page.getByTestId("invite-result")).toBeVisible();
      const newLink = await page.getByTestId("invite-link").inputValue();
      expect(newLink, "the admin sees the new link").toContain("#set-password=");
      await page.locator(".modal-footer button", { hasText: "Done" }).click();

      // The old link is dead from the commit on.
      const context = await browser.newContext();
      const stale = await context.newPage();
      await stale.goto(`${appOrigin}/${oldHash}`);
      await expect(stale.getByTestId("set-password-form")).toBeVisible();
      await stale.getByLabel("New password").fill(`Stale-${marker}-pass`);
      await stale.getByLabel("Confirm password").fill(`Stale-${marker}-pass`);
      await stale.getByTestId("set-password-form").locator('button[type="submit"]').click();
      await expect(stale.getByTestId("set-password-error")).toContainText("invalid or has expired");
      await context.close();

      assertNoPageErrors(pageErrors);
    } finally {
      if (teacherId) await archiveUser(adminToken, teacherId);
    }
  });
});
