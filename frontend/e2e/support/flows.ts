import { expect, type Page } from "@playwright/test";
import { nav, expectNotice } from "./fixtures";

/** ISO date `offset` days from today, matching the app's local-time helper. */
export function isoDaysFromNow(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Long date exactly as `formatLongDate` renders it in modal descriptions. */
export function longDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Opens the first course this account can edit and waits for its plan rows.
 * Returns the course label so a failure message says which course was used.
 */
export async function openEditableCourse(page: Page): Promise<string> {
  await nav(page, "Curriculum");
  const cards = page.locator("button.course-card");
  await expect(cards.first()).toBeVisible();

  const count = await cards.count();
  for (let index = 0; index < Math.min(count, 12); index += 1) {
    const card = cards.nth(index);
    const label = (await card.innerText()).replace(/\s+/g, " ").trim();
    if (label.includes("view only")) continue;

    await card.click();
    // The course header and its plan rows render in the same commit, so the
    // back button is the signal that the detail view (not the list) is up.
    const back = await page
      .waitForSelector("button.course-back", { timeout: 5_000 })
      .catch(() => null);
    if (!back) throw new Error(`Could not open the course "${label}"`);

    if ((await page.locator(".course-plan-main").count()) > 0) return label;

    await back.click();
    await expect(cards.first()).toBeVisible();
  }
  throw new Error("No editable course with lesson plans was found for this account");
}

/** Uploads a file into the open lesson plan and returns the upload response. */
export async function uploadPlanFile(
  page: Page,
  filePath: string,
): Promise<{ status: number; body: { id?: string; name?: string; size?: number } }> {
  await page.locator(".course-plan-main").first().click();
  const planFiles = page.locator(".plan-files").first();
  await expect(planFiles).toBeVisible();

  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/uploads") && response.request().method() === "POST",
  );
  await planFiles.locator('.plan-upload input[type="file"]').setInputFiles(filePath);
  const response = await responsePromise;
  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    size?: number;
  };
  return { status: response.status(), body };
}

/**
 * Opens the last still-closed slot on `date` (the app closes every slot by
 * default) and returns its times. Trading the last slot keeps the morning free
 * for seeded lessons.
 */
export async function openTeacherSlot(
  page: Page,
  date: string,
): Promise<{ time: string; endTime: string }> {
  await nav(page, "Booking slots");
  const dateInput = page.locator('input[aria-label="Booking slot date"]');
  await expect(dateInput).toBeVisible();
  await dateInput.fill(date);
  await dateInput.blur();

  const closedRows = page.locator(".teacher-slot-row.status-closed");
  await expect(closedRows.first()).toBeVisible();
  const row = closedRows.last();

  const time = (await row.locator(".teacher-slot-time strong").innerText()).trim();
  const endTime = (await row.locator(".teacher-slot-time span").innerText())
    .replace(/^to\s+/i, "")
    .trim();

  await row.locator('button:has-text("Open slot")').click();
  await expectNotice(page, /opened for bookings/i);
  return { time, endTime };
}

/**
 * Opens the teacher lesson card for `date` at `time`. Cards do not carry the
 * lesson id, so the modal description (student · long date · time) is the
 * identity check before acting.
 */
export async function openTeacherLesson(
  page: Page,
  match: { time: string; date: string; studentName: string },
): Promise<void> {
  await nav(page, "Lessons");
  await page.locator('.student-tab:has-text("Upcoming")').click();

  const cards = page.locator("button.lesson-card-main").filter({ hasText: match.time });
  await expect(cards.first()).toBeVisible();

  const expectedDate = longDate(match.date);
  const count = await cards.count();
  for (let index = 0; index < count; index += 1) {
    await cards.nth(index).click();
    const modal = page.locator(".student-modal");
    await expect(modal).toBeVisible();
    const description = await modal.innerText();
    if (description.includes(expectedDate) && description.includes(match.studentName)) {
      return;
    }
    await page.locator('.student-modal button:has-text("Close")').first().click();
    await expect(modal).toBeHidden();
  }
  throw new Error(
    `No ${match.studentName} lesson at ${match.time} on ${expectedDate} was found in the teacher's Upcoming list`,
  );
}
