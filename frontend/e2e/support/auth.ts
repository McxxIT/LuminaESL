import { expect, type Page, type Response } from "@playwright/test";
import { SEEDED_PASSWORD } from "./api";
import { nav } from "./fixtures";

const NAV_VISIBLE = 120_000;
const RESPONSE_TIMEOUT = 120_000;

/**
 * Signs in through the real login screen and waits for the workspace to render.
 * Returns the statuses of the two requests that prove API mode is backing it.
 */
export async function signIn(
  page: Page,
  email: string,
  password = SEEDED_PASSWORD,
): Promise<{ login: number; bootstrap: number }> {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const emailInput = page.locator('input[type="email"]');
  await expect(emailInput).toBeVisible();

  const loginPromise = page.waitForResponse(
    (response) => response.url().includes("/auth/login") && response.request().method() === "POST",
    { timeout: RESPONSE_TIMEOUT },
  );
  const bootstrapPromise = page.waitForResponse(
    (response) => response.url().includes("/school/bootstrap"),
    { timeout: RESPONSE_TIMEOUT },
  );

  await emailInput.fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  await expect(page.locator("button.nav-item").first()).toBeVisible({ timeout: NAV_VISIBLE });

  const [login, bootstrapResponse] = await Promise.all([loginPromise, bootstrapPromise]);
  return { login: login.status(), bootstrap: bootstrapResponse.status() };
}

/** Opens the sign-out dialog from the sidebar and confirms it. */
export async function signOut(page: Page): Promise<number> {
  await nav(page, "Log out");
  const logoutPromise = page.waitForResponse(
    (response) => response.url().includes("/auth/logout") && response.request().method() === "POST",
    { timeout: RESPONSE_TIMEOUT },
  );
  await page.locator('.modal-footer button:has-text("Log out")').click();
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: NAV_VISIBLE });
  return (await logoutPromise).status();
}

/** Waits for a specific API response and returns it. */
export function waitForApi(page: Page, pathPart: string, method = "GET"): Promise<Response> {
  return page.waitForResponse(
    (response) => response.url().includes(pathPart) && response.request().method() === method,
    { timeout: RESPONSE_TIMEOUT },
  );
}
