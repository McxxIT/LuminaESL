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
import { isoDaysFromNow, openEditableCourse, openTeacherLesson } from "../support/flows";

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

    // Passwords are an API-auth concern: demo Settings shows only the explainer.
    await expect(page.getByTestId("password-demo-card")).toContainText("Demo mode — passwords are not enforced");
    await expect(page.getByTestId("password-change-card")).toHaveCount(0);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

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
  /**
   * Curriculum Library in demo mode: the manager adds and archives items in the Library tab,
   * attaches one to Mia's lesson, the student downloads it from IndexedDB, and the teacher sees
   * it with no attach control. Archived items never reach the picker, completed lessons offer
   * no Materials action, and nothing calls the API.
   */
  test("runs the Curriculum Library locally", async ({ page }, testInfo) => {
    const pageErrors = collectPageErrors(page);
    const marker = runId();
    const title = `Demo library ${marker}`;
    const archivedTitle = `Demo archived ${marker}`;
    const bytes = pdfBuffer(marker);
    const filePath = await writeFixture(testInfo, `demo-library-${marker}.pdf`, bytes);
    const otherPath = await writeFixture(testInfo, `demo-archived-${marker}.pdf`, pdfBuffer(`${marker}-archived`));

    const apiCalls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/")) apiCalls.push(request.url());
    });
    const demoSignIn = async (email: string) => {
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill("demo-pass");
      await page.locator('button[type="submit"]').click();
      await expect(page.locator("button.nav-item").first()).toBeVisible();
    };
    const demoSignOut = async () => {
      await nav(page, "Log out");
      await page.locator('.modal-footer button:has-text("Log out")').click();
      await expect(page.locator('input[type="email"]')).toBeVisible();
    };
    const addMaterial = async (itemTitle: string, file: string) => {
      await page.locator('button:has-text("Add material")').click();
      const form = page.locator("#library-item-form");
      await form.locator('input[type="file"]').setInputFiles(file);
      await form.locator('label:has-text("Title") input').fill(itemTitle);
      await form.locator('label:has-text("Category") input').fill("Worksheets");
      await page.locator('button[form="library-item-form"]').click();
      await expectNotice(page, /added to the library/i);
    };

    await page.goto("/");
    await demoSignIn("manager@lumina.school");

    // Library tab: create two items, archive one.
    await nav(page, "Curriculum");
    const libraryTab = page.getByRole("tab", { name: "Library" });
    await expect(libraryTab, "the Courses / Library toggle is visible").toBeVisible();
    await libraryTab.click();
    await addMaterial(title, filePath);
    await expect(
      page.getByTestId("library-item").filter({ hasText: title }),
      "demo library shows the local creator name",
    ).toContainText("by Priya Raman");
    expect(apiCalls, "demo library create must not call the API").toEqual([]);
    await addMaterial(archivedTitle, otherPath);
    await page.getByTestId("library-item").filter({ hasText: archivedTitle }).locator('button:has-text("Archive")').click();
    await expectNotice(page, /archived/i);
    await expect(page.getByTestId("library-item").filter({ hasText: archivedTitle })).toHaveCount(0);

    // Attach to Mia's next lesson from the Students screen.
    await nav(page, "Students");
    await page.locator('input[aria-label="Search students"]').fill("Mia Chen");
    await page.locator("button.manager-table-row").filter({ hasText: "Mia Chen" }).first().click();
    const upcoming = page.locator(".manager-mini-list > div").filter({ hasText: "Business English" }).first();
    await upcoming.locator('button:has-text("Materials")').click();
    const picker = page.locator("#library-picker-form");
    await expect(picker).toBeVisible();
    const options = await picker.locator('select[aria-label="Library item"] option').allInnerTexts();
    expect(options.some((option) => option.includes(title)), "published item is offered").toBe(true);
    expect(options.some((option) => option.includes(archivedTitle)), "archived item is not offered").toBe(false);
    await picker.locator('select[aria-label="Library item"]').selectOption({ label: `${title} · Worksheets` });
    await page.locator('button[form="library-picker-form"]').click();
    await expectNotice(page, /attached/i);
    await expect(picker.locator(".manager-mini-list")).toContainText(title);
    await page.locator('.modal-footer button:has-text("Done")').click();
    // Closing the picker returns to the student's detail dialog; close that too.
    await expect(page.locator(".manager-mini-list").first()).toContainText("1 material");
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal-backdrop")).toHaveCount(0);

    // A completed lesson offers no Materials action.
    await nav(page, "Schedule");
    const completed = page.locator(".schedule-item.lesson.status-completed");
    for (let week = 0; week < 3 && !(await completed.count()); week += 1) {
      await page.locator('button[aria-label="Previous week"]').click();
    }
    await completed.first().click();
    await expect(page.locator(".modal-footer")).toBeVisible();
    await expect(page.locator('.modal-footer button:has-text("Materials")')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal-backdrop")).toHaveCount(0);
    await demoSignOut();

    // The student sees the material and downloads the stored bytes.
    await demoSignIn("student@lumina.school");
    await nav(page, "Lessons");
    await page.locator('input[aria-label="Search lessons"]').fill("Business English");
    await page.locator("button.lesson-card-main").filter({ hasText: "14:30" }).first().click();
    const studentMaterials = page.getByTestId("student-lesson-materials");
    await expect(studentMaterials).toContainText(title);
    const downloadEvent = page.waitForEvent("download");
    await studentMaterials.locator("button.lesson-material-file").first().click();
    const downloaded = await downloadBytes(await downloadEvent);
    expect(downloaded.equals(bytes), "IndexedDB returns the library file").toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal-backdrop")).toHaveCount(0);
    await demoSignOut();

    // The teacher sees it with no attach control.
    await demoSignIn("teacher@lumina.school");
    await openTeacherLesson(page, { time: "14:30", date: isoDaysFromNow(1), studentName: "Mia Chen" });
    await expect(page.getByTestId("teacher-library-materials")).toContainText(title);
    await expect(page.locator('.student-modal button:has-text("Materials")')).toHaveCount(0);
    await expect(page.locator('.student-modal button:has-text("Attach")')).toHaveCount(0);

    expect(apiCalls, "demo mode must not call the API").toEqual([]);
    assertNoPageErrors(pageErrors);
  });
});
