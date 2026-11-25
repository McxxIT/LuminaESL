import { expect, test } from "@playwright/test";
import { signIn, signOut } from "../support/auth";
import {
  assertNoPageErrors,
  collectPageErrors,
  expectNotice,
  nav,
  runId,
} from "../support/fixtures";
import { ensurePreconditions } from "../support/preconditions";

/**
 * Homework parity. Unlike the seeded assignments this run creates its own
 * assignment, so grading it cannot disturb another account's data.
 */
test.describe("API mode homework", () => {
  test.beforeAll(async () => {
    await ensurePreconditions();
  });

  test("teacher assigns homework, student submits it, teacher reviews it", async ({ page }) => {
    const { student } = await ensurePreconditions();
    const pageErrors = collectPageErrors(page);
    const title = `E2E homework ${runId()}`;

    await signIn(page, "teacher@lumina.school");
    await nav(page, "Students");
    const studentCard = page.locator(".teacher-student-card").filter({ hasText: student.name });
    await expect(studentCard.first()).toBeVisible();

    await studentCard.first().locator('button:has-text("Assign homework")').click();
    const assignForm = page.locator("#teacher-homework-form");
    await expect(assignForm).toBeVisible();
    await assignForm.locator("input").first().fill(title);
    await page.locator('button[form="teacher-homework-form"]').click();
    await expectNotice(page, /Homework assigned/i);

    await signOut(page);
    await signIn(page, "student@lumina.school");
    await nav(page, "Assignments");

    const assignment = page.locator(".student-assignment-card").filter({ hasText: title });
    await expect(assignment).toBeVisible();
    await assignment.locator(".assignment-card-actions button").first().click();

    const submitForm = page.locator("#assignment-submit-form");
    await expect(submitForm).toBeVisible();
    await submitForm.locator("textarea").fill(`Response to "${title}" — submitted by the parity suite.`);
    await page.locator('button[form="assignment-submit-form"]').click();
    await expectNotice(page, /submitted to/i);

    await signOut(page);
    await signIn(page, "teacher@lumina.school");
    await nav(page, "Students");
    await page
      .locator(".teacher-student-card")
      .filter({ hasText: student.name })
      .first()
      .locator('button:has-text("Open profile")')
      .click();

    const profile = page.locator(".student-modal");
    await expect(profile).toBeVisible();
    const homeworkRow = profile.locator(".teacher-homework-row").filter({ hasText: title });
    await expect(homeworkRow).toBeVisible();
    await homeworkRow.locator('button:has-text("Review")').click();

    const reviewForm = page.locator("#teacher-review-form");
    await expect(reviewForm).toBeVisible();
    await reviewForm.locator("textarea").fill(`Clear, well-structured work on "${title}".`);
    await page.locator('button[form="teacher-review-form"]').click();
    await expectNotice(page, /reviewed/i);
    const reviewedRow = page
      .locator(".student-modal .teacher-homework-row")
      .filter({ hasText: title });
    await expect(reviewedRow.locator(".teacher-homework-status")).toHaveText("Reviewed");
    await expect(reviewedRow.locator('button:has-text("Review")')).toHaveCount(0);

    assertNoPageErrors(pageErrors);
  });
});
