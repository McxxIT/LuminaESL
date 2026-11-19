import { expect, test } from "@playwright/test";
import { signIn } from "../support/auth";
import { runId } from "../support/fixtures";
import {
  ATTACHMENT_FILE_KEY,
  ATTACHMENT_DATA_URL,
  createLocalSchoolFixture,
  seedLocalSchoolArgs,
} from "../support/local-school";
import { ensurePreconditions } from "../support/preconditions";

/**
 * The cutover's safety property: signing in through the API must never write the
 * local store key. Before D2 it did (`hydrateSchool` persisted the bootstrap over
 * `lumina-school:v1`), which destroyed local-only data on the first API login.
 *
 * The same test proves the pre-bootstrap capture: a local snapshot is copied to
 * `lumina-school:pending-import` before the bootstrap response can overwrite anything.
 */
test.describe("API mode storage keys", () => {
  test.beforeAll(async () => {
    await ensurePreconditions();
  });

  test("keeps the local store untouched and captures it for import", async ({ page }) => {
    const id = runId();
    const fixture = createLocalSchoolFixture(id);
    const args = seedLocalSchoolArgs(fixture);

    await page.addInitScript((seed) => {
      window.localStorage.setItem("lumina-school:v1", seed.raw);
      window.localStorage.setItem(seed.fileKey, seed.dataUrl);
    }, args);

    const session = await signIn(page, "admin@lumina.school");
    expect(session.bootstrap, "GET /school/bootstrap").toBe(200);

    const storage = await page.evaluate((fileKey) => ({
      local: window.localStorage.getItem("lumina-school:v1"),
      cache: window.localStorage.getItem("lumina-school:api-cache"),
      owner: window.localStorage.getItem("lumina-school:cache-owner"),
      pending: window.localStorage.getItem("lumina-school:pending-import"),
      file: window.localStorage.getItem(fileKey),
    }), ATTACHMENT_FILE_KEY);

    expect(storage.local, "local store must be byte-identical after an API login").toBe(fixture.raw);
    expect(storage.file, "attachment bytes must survive too").toBe(ATTACHMENT_DATA_URL);
    expect(storage.cache, "the API cache lives in its own key").toBeTruthy();
    expect(storage.owner).toBe("admin@lumina.school");

    const cache = JSON.parse(storage.cache ?? "{}") as { version?: number; collections?: unknown };
    expect(cache.version, "api cache holds the bootstrap payload").toBe(3);
    expect(cache.collections).toBeTruthy();

    expect(storage.pending, "the local snapshot is captured before the bootstrap").toBeTruthy();
    const pending = JSON.parse(storage.pending ?? "{}") as {
      sourceSeededAt?: string;
      recordCount?: number;
      data?: { seededAt?: string };
    };
    expect(pending.sourceSeededAt).toBe(fixture.markers.seededAt);
    expect(pending.data?.seededAt).toBe(fixture.markers.seededAt);
    expect(pending.recordCount ?? 0).toBeGreaterThan(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("button.nav-item").first()).toBeVisible({ timeout: 120_000 });
    const afterReload = await page.evaluate(() => window.localStorage.getItem("lumina-school:pending-import"));
    expect(afterReload, "a second boot must not replace the capture").toBe(storage.pending);
  });

  test("does not capture a previous API cache as if it were local data", async ({ page }) => {
    // A cache from an older build only contains server UUIDs. It must not be
    // mistaken for a local school, or the import would try to remap server rows.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "lumina-school:v1",
        JSON.stringify({
          version: 3,
          seededAt: "2026-01-01T00:00:00.000Z",
          settings: {
            schoolName: "Lumina ESL",
            onTheSpotCancellationHours: 2,
            performanceWindowDays: 30,
            bookingDayStart: "08:00",
            bookingDayEnd: "23:30",
            studentLateCancellationHours: 24,
            refundTeacherCancellations: true,
          },
          collections: {
            users: {
              "11111111-1111-4111-8111-111111111111": {
                id: "11111111-1111-4111-8111-111111111111",
                role: "admin",
                name: "Ada Admin",
                email: "admin@lumina.school",
                status: "active",
                avatarColor: "#6366f1",
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            },
          },
        }),
      );
    });

    await signIn(page, "admin@lumina.school");
    const pending = await page.evaluate(() => window.localStorage.getItem("lumina-school:pending-import"));
    expect(pending, "a UUID-only payload is an API cache, not local data").toBeNull();
  });
});
