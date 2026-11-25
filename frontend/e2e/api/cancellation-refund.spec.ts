import { expect, test } from "@playwright/test";
import { signIn, signOut } from "../support/auth";
import { bootstrap, creditBalance, lessonAt, cancellationRequestFor } from "../support/api";
import {
  assertNoPageErrors,
  collectPageErrors,
  downloadBytes,
  expectNotice,
  nav,
  pngBuffer,
  runId,
  writeFixture,
} from "../support/fixtures";
import { isoDaysFromNow, openTeacherLesson, openTeacherSlot } from "../support/flows";
import { ensurePreconditions } from "../support/preconditions";

/**
 * Cancellation and refund parity, using a lesson this run creates end to end:
 * manager books on behalf of the seeded student, the teacher requests a
 * cancellation with PNG evidence, the manager approves it, and the credit comes
 * back. No pre-existing pending request is ever approved.
 */
test.describe("API mode cancellation and refund", () => {
  test.beforeAll(async () => {
    await ensurePreconditions();
  });

  test("approving a teacher cancellation refunds exactly one credit", async ({ page }, testInfo) => {
    const { adminToken, student, teacher } = await ensurePreconditions();
    const pageErrors = collectPageErrors(page);
    const marker = runId();
    const date = isoDaysFromNow(6);
    const evidenceName = `evidence-${marker}.png`;
    const evidencePath = await writeFixture(testInfo, evidenceName, pngBuffer());

    await signIn(page, "teacher@lumina.school");
    const slot = await openTeacherSlot(page, date);
    await signOut(page);

    // Manager books for the seeded student in the freshly opened slot.
    await signIn(page, "manager@lumina.school");
    await nav(page, "Schedule");
    await page.locator('button:has-text("Book a lesson")').first().click();

    const form = page.locator("#book-behalf-form");
    await expect(form).toBeVisible();

    const teacherSelect = form.locator('label:has-text("Teacher") select');
    const teacherOptions = await teacherSelect.locator("option").allInnerTexts();
    const teacherIndex = teacherOptions.findIndex((option) => option.includes(teacher.name));
    expect(teacherIndex, `manager must own ${teacher.name}`).toBeGreaterThanOrEqual(0);
    await teacherSelect.selectOption({ label: teacherOptions[teacherIndex] });

    const studentSelect = form.locator('label:has-text("Student") select');
    const studentOptions = await studentSelect.locator("option").allInnerTexts();
    const studentIndex = studentOptions.findIndex((option) => option.includes(student.name));
    expect(studentIndex, `student ${student.name} must be on the manager's team`).toBeGreaterThanOrEqual(0);
    await studentSelect.selectOption({ label: studentOptions[studentIndex] });

    const dateInput = form.locator('input[type="date"]');
    await dateInput.fill(date);
    await dateInput.blur();

    const slotSelect = form.locator('label:has-text("Open slot") select');
    await expect(slotSelect.locator(`option[value="${slot.time}"]`)).toHaveCount(1);
    await slotSelect.selectOption(slot.time);

    await page.locator('button[form="book-behalf-form"]').click();
    await expectNotice(page, /booked for/i);

    const balanceBooked = await creditBalance(adminToken, student.id);

    // Teacher requests the cancellation with evidence.
    await signOut(page);
    await signIn(page, "teacher@lumina.school");
    await openTeacherLesson(page, { time: slot.time, date, studentName: student.name });
    await page.locator('.student-modal button:has-text("Request cancellation")').click();

    const cancelForm = page.locator("#teacher-cancel-form");
    await expect(cancelForm).toBeVisible();
    await cancelForm
      .locator("textarea")
      .fill(`Camera equipment failed (${marker}); the lesson cannot go ahead.`);
    await cancelForm.locator('input[type="file"]').setInputFiles(evidencePath);

    const sendRequest = page.locator('button[form="teacher-cancel-form"]');
    await expect(sendRequest).toBeEnabled();
    await sendRequest.click();
    await expectNotice(page, /Cancellation request sent/i);

    const afterRequest = await bootstrap(adminToken);
    const request = cancellationRequestFor(afterRequest, marker);
    expect(request.status).toBe("pending");
    expect(request.lessonId).toBeTruthy();

    // Manager approves, seeing the evidence the teacher attached.
    await signOut(page);
    await signIn(page, "manager@lumina.school");
    await nav(page, "Approvals");

    const cancellations = page.locator(".admin-closures-panel").nth(1);
    const row = cancellations.locator(".admin-closure-row").filter({ hasText: marker });
    await expect(row).toBeVisible();
    await row.locator('button:has-text("Approve")').click();

    const review = page.locator("#manager-cancellation-form");
    await expect(review).toBeVisible();

    const evidence = review.locator(`img[alt="${evidenceName}"]`);
    await expect(evidence).toBeVisible();
    const evidenceSrc = await evidence.getAttribute("src");
    expect(evidenceSrc?.startsWith("blob:"), "API evidence is an authenticated blob").toBe(true);

    const downloadEvent = page.waitForEvent("download");
    await evidence.click();
    const downloadedEvidence = await downloadBytes(await downloadEvent);
    expect(downloadedEvidence.length).toBeGreaterThan(0);

    await page.locator('button[form="manager-cancellation-form"]').click();
    await expectNotice(page, /Cancellation approved/i);

    const balanceRefunded = await creditBalance(adminToken, student.id);
    expect(balanceRefunded - balanceBooked).toBeCloseTo(1, 5);

    const afterApproval = await bootstrap(adminToken);
    const lesson = lessonAt(afterApproval, { studentId: student.id, date, time: slot.time });
    expect(lesson.status).toBe("cancelled");
    expect(cancellationRequestFor(afterApproval, marker).status).toBe("approved");

    assertNoPageErrors(pageErrors);
  });
});
