import { expect, test } from "@playwright/test";
import { signIn, signOut } from "../support/auth";
import { bootstrap, creditBalance, lessonAt } from "../support/api";
import {
  assertNoPageErrors,
  collectPageErrors,
  expectNotice,
  nav,
} from "../support/fixtures";
import { isoDaysFromNow, openTeacherSlot } from "../support/flows";
import { ensurePreconditions } from "../support/preconditions";

/**
 * Booking parity: the teacher opens a slot, the student books it through the
 * dialog, and the ledger moves by exactly one credit. The slot is chosen from
 * the still-closed rows, so the lesson at that date and time is ours.
 */
test.describe("API mode booking", () => {
  test.beforeAll(async () => {
    await ensurePreconditions();
  });

  test("student books an open slot and is charged exactly one credit", async ({ page }) => {
    const { adminToken, student, teacher } = await ensurePreconditions();
    const pageErrors = collectPageErrors(page);
    const date = isoDaysFromNow(4);
    const balanceBefore = await creditBalance(adminToken, student.id);

    await signIn(page, "teacher@lumina.school");
    const slot = await openTeacherSlot(page, date);
    await signOut(page);

    await signIn(page, "student@lumina.school");
    await nav(page, "Lessons");
    await page.locator('button:has-text("Book a lesson")').first().click();

    const form = page.locator("#book-lesson-form");
    await expect(form).toBeVisible();

    const tutorSelect = form.locator('label:has-text("Tutor") select');
    const tutorOptions = await tutorSelect.locator("option").allInnerTexts();
    const tutorIndex = tutorOptions.findIndex((option) => option.includes(teacher.name));
    expect(tutorIndex, `student must be enrolled with ${teacher.name}`).toBeGreaterThanOrEqual(0);
    await tutorSelect.selectOption({ label: tutorOptions[tutorIndex] });

    const dateInput = form.locator('input[type="date"]');
    await dateInput.fill(date);
    await dateInput.blur();

    const slotButton = form
      .locator("button.student-slot-button")
      .filter({ hasText: slot.time })
      .first();
    await expect(slotButton).toBeVisible();
    await slotButton.click();

    await page.locator('button[form="book-lesson-form"]').click();
    await expectNotice(page, /booked with/i);

    const balanceAfter = await creditBalance(adminToken, student.id);
    expect(balanceAfter - balanceBefore).toBeCloseTo(-1, 5);

    const school = await bootstrap(adminToken);
    const lesson = lessonAt(school, { studentId: student.id, date, time: slot.time });
    expect(lesson.status).toBe("scheduled");
    expect(lesson.teacherId).toBe(teacher.id);

    await expect(
      page.locator("button.lesson-card-main").filter({ hasText: slot.time }).first(),
    ).toBeVisible();

    assertNoPageErrors(pageErrors);
  });
});
