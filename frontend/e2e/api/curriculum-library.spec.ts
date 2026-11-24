import { expect, test } from "@playwright/test";
import {
  apiCall,
  apiLogin,
  archiveUser,
  createDisposableUser,
  creditBalance,
  setCreditBalance,
  type ApiLesson,
} from "../support/api";
import { signIn, signOut, waitForApi } from "../support/auth";
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
import { isoDaysFromNow, openTeacherLesson } from "../support/flows";
import { ensurePreconditions } from "../support/preconditions";

/**
 * Curriculum Library in API mode: the manager uploads a PDF in the Library tab,
 * attaches it to a student's lesson through the Materials dialog, the student
 * downloads identical bytes, an unrelated student is refused, and the teacher
 * downloads it with no attach control. The spec archives what it creates,
 * cancels its lesson, and restores the student's credits.
 */
test.describe("API mode Curriculum Library", () => {
  test.beforeAll(async () => {
    await ensurePreconditions();
  });

  test("manager attaches a library file that the student and teacher can download", async ({ page }, testInfo) => {
    const { adminToken, teacher, student } = await ensurePreconditions();
    const pageErrors = collectPageErrors(page);
    const marker = runId();
    const title = `Library ${marker}`;
    const fileName = `library-${marker}.pdf`;
    const bytes = pdfBuffer(marker);
    const filePath = await writeFixture(testInfo, fileName, bytes);
    const managerToken = await apiLogin("manager@lumina.school");

    const startingBalance = await creditBalance(adminToken, student.id);
    await setCreditBalance(adminToken, student.id, Math.max(startingBalance, 5));

    let lessonId: string | undefined;
    let itemId: string | undefined;
    let disposableId: string | undefined;
    try {
      // A lesson this run owns, next week, at a free evening slot.
      const date = isoDaysFromNow(8);
      let time = "";
      for (const candidate of ["20:30", "21:00", "21:30", "20:00", "19:30", "19:00"]) {
        const created = await apiCall<ApiLesson>("/lessons", {
          method: "POST",
          token: adminToken,
          body: { teacherId: teacher.id, studentId: student.id, date, time: candidate, title },
        });
        if (created.status === 201) {
          lessonId = created.body.id;
          time = candidate;
          break;
        }
        expect(created.status, `schedule lesson at ${candidate}`).toBe(409);
      }
      expect(lessonId, "the spec needs a free slot next week").toBeTruthy();

      // 1. Manager adds the file to the library.
      await signIn(page, "manager@lumina.school");
      await nav(page, "Curriculum");
      await page.getByRole("tab", { name: "Library" }).click();
      await page.locator('button:has-text("Add material")').click();
      const form = page.locator("#library-item-form");
      await expect(form).toBeVisible();
      await form.locator('input[type="file"]').setInputFiles(filePath);
      await form.locator('label:has-text("Title") input').fill(title);
      await form.locator('label:has-text("Category") input').fill("E2E worksheets");
      const createResponse = waitForApi(page, "/api/v1/library", "POST");
      await page.locator('button[form="library-item-form"]').click();
      const created = await createResponse;
      expect(created.status(), "POST /library").toBe(201);
      const createdBody = (await created.json()) as { id: string; createdByName?: string };
      itemId = createdBody.id;
      expect(createdBody.createdByName, "POST /library ships the creator display name").toBeTruthy();
      await expectNotice(page, /added to the library/i);
      await expect(page.getByTestId("library-item").filter({ hasText: title })).toBeVisible();
      await expect(
        page.getByTestId("library-item").filter({ hasText: title }),
        "the Library tab shows the creator display name",
      ).toContainText(`by ${createdBody.createdByName}`);

      // 2. Manager attaches it from the Schedule lesson dialog.
      await nav(page, "Schedule");
      const lessonButton = page.locator(".schedule-item.lesson").filter({ hasText: title });
      for (let week = 0; week < 3 && !(await lessonButton.count()); week += 1) {
        await page.locator('button[aria-label="Next week"]').click();
      }
      await lessonButton.first().click();
      await page.locator('.modal-footer button:has-text("Materials")').click();
      const picker = page.locator("#library-picker-form");
      await expect(picker).toBeVisible();
      await picker.locator('select[aria-label="Library item"]').selectOption({ label: `${title} · E2E worksheets` });
      const attachResponse = waitForApi(page, "/library-items", "POST");
      await page.locator('button[form="library-picker-form"]').click();
      expect((await attachResponse).status(), "POST /lessons/:id/library-items").toBe(200);
      await expectNotice(page, /attached/i);
      await expect(picker.locator(".manager-mini-list")).toContainText(title);
      await page.locator('.modal-footer button:has-text("Done")').click();
      await expect(page.getByTestId("manager-lesson-materials")).toContainText(title);
      await page.keyboard.press("Escape");
      await expect(page.locator(".modal-backdrop")).toHaveCount(0);
      await signOut(page);

      // 3. The student sees and downloads identical bytes.
      await signIn(page, "student@lumina.school");
      await nav(page, "Lessons");
      await page.locator('input[aria-label="Search lessons"]').fill(marker);
      await page.locator("button.lesson-card-main").filter({ hasText: title }).first().click();
      const studentMaterials = page.getByTestId("student-lesson-materials");
      await expect(studentMaterials).toContainText(title);
      const studentDownload = page.waitForEvent("download");
      await studentMaterials.locator("button.lesson-material-file").filter({ hasText: title }).click();
      const studentBytes = await downloadBytes(await studentDownload);
      expect(studentBytes.equals(bytes), `student downloaded ${studentBytes.length} bytes, uploaded ${bytes.length}`).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.locator(".modal-backdrop")).toHaveCount(0);
      await signOut(page);

      // 4. An unrelated student cannot fetch the file.
      const attachments = await apiCall<{ collections: { libraryItems: Record<string, { attachmentId: string }> } }>("/school/bootstrap", { token: managerToken });
      const attachmentId = attachments.body.collections.libraryItems[itemId]?.attachmentId;
      expect(attachmentId, "library item carries its attachment id").toBeTruthy();
      const disposablePassword = `Library-${marker}-pw`;
      const disposable = await createDisposableUser(adminToken, {
        name: `E2E library outsider ${marker}`,
        email: `e2e-library-${marker}@lumina.test`,
        password: disposablePassword,
        role: "student",
      });
      disposableId = disposable.id;
      const outsiderToken = await apiLogin(disposable.email, disposablePassword);
      expect((await apiCall(`/uploads/${attachmentId}/download`, { token: outsiderToken })).status, "unrelated student download").toBe(403);
      expect((await apiCall(`/lessons/${lessonId}/library-items`, { method: "POST", token: outsiderToken, body: { libraryItemId: itemId } })).status, "student attach").toBe(403);

      // 5. The teacher downloads it and has no attach control.
      await signIn(page, "teacher@lumina.school");
      await openTeacherLesson(page, { time, date, studentName: student.name });
      const teacherMaterials = page.getByTestId("teacher-library-materials");
      await expect(teacherMaterials).toContainText(title);
      await expect(page.locator('.student-modal button:has-text("Materials")')).toHaveCount(0);
      await expect(page.locator('.student-modal button:has-text("Attach")')).toHaveCount(0);
      const teacherDownload = page.waitForEvent("download");
      await teacherMaterials.locator("button.lesson-material-file").filter({ hasText: title }).click();
      const teacherBytes = await downloadBytes(await teacherDownload);
      expect(teacherBytes.equals(bytes), "teacher downloads identical bytes").toBe(true);

      assertNoPageErrors(pageErrors);
    } finally {
      if (itemId) await apiCall(`/library/${itemId}`, { method: "PATCH", token: managerToken, body: { status: "archived" } });
      if (lessonId) await apiCall(`/lessons/${lessonId}`, { method: "PATCH", token: adminToken, body: { status: "cancelled" } });
      if (disposableId) await archiveUser(adminToken, disposableId);
      await setCreditBalance(adminToken, student.id, startingBalance);
    }
  });
});
