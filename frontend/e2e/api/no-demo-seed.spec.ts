import { expect, test } from "@playwright/test";
import { createMemoryAdapter } from "../../app/lib/school/adapter";
import { createSeedSchool, defaultSchoolSettings } from "../../app/lib/school/seed";
import {
  configureSchoolDataSource,
  configureSchoolStore,
  getSchoolSnapshot,
  resetSchool,
} from "../../app/lib/school/store";
import { signIn, signOut } from "../support/auth";
import { assertNoPageErrors, collectPageErrors, nav, runId } from "../support/fixtures";
import { createLocalSchoolFixture } from "../support/local-school";
import { ensurePreconditions } from "../support/preconditions";

/**
 * D3: demo data must not reach an API-mode session.
 *
 * Two things are proven here:
 *
 * 1. From the outside (browser): an API account boots over a stale offline cache that predates the
 *    `assignments` collection, and the session still carries no demo seed record: no demo homework,
 *    no demo course title, no demo marker row from the stale payload, and no "Reset demo" control in
 *    any role's settings. `lumina-school:v1` stays byte-identical.
 * 2. From the store (node): `resetSchool()` is inert in API mode, so a stale call site cannot
 *    resurrect the demo school even though the buttons are gone.
 *
 * The stale cache is deliberately unparseable by `parseSchoolData` (it requires every collection
 * key), which is also why `upgrade()`'s API branch is defence in depth rather than a live code
 * path; the D3 execute report records that limit under "Test Infra Gaps Found".
 */

const STALE_SEEDED_AT = "2026-01-01T00:00:00.000Z";

type CollectionKey =
  | "users"
  | "teacherProfiles"
  | "studentProfiles"
  | "courses"
  | "courseUnits"
  | "lessonPlans"
  | "attachments"
  | "enrollments"
  | "lessons"
  | "slotOpenings"
  | "requests"
  | "absences"
  | "ratings"
  | "assignments"
  | "credits"
  | "activity";

const OTHER_COLLECTIONS: CollectionKey[] = [
  "users",
  "teacherProfiles",
  "studentProfiles",
  "courseUnits",
  "lessonPlans",
  "attachments",
  "enrollments",
  "lessons",
  "slotOpenings",
  "requests",
  "absences",
  "ratings",
  "credits",
  "activity",
];

/** A cached API payload from before `assignments` existed, plus one marker row only it has. */
function staleCachePayload(marker: string) {
  const collections: Record<string, unknown> = {};
  for (const key of OTHER_COLLECTIONS) collections[key] = {};
  collections.courses = {
    [marker]: {
      id: marker,
      title: `stale-cache-course-${marker}`,
      level: "A2-C1",
      summary: "Rows from a cached payload D3 must never show",
      objectives: [],
      status: "published",
      ownerId: "stale-owner",
      createdAt: STALE_SEEDED_AT,
      updatedAt: STALE_SEEDED_AT,
    },
  };
  return {
    version: 3,
    seededAt: STALE_SEEDED_AT,
    settings: defaultSchoolSettings(),
    collections,
  };
}

test.describe("API mode carries no demo data", () => {
  test.beforeAll(async () => {
    await ensurePreconditions();
  });

  test("boots over a stale cache with no demo seed records and no reset control", async ({ page }) => {
    const marker = runId();
    const stale = staleCachePayload(marker);
    const local = createLocalSchoolFixture(marker);
    const demo = createSeedSchool();
    const demoAssignmentIds = Object.keys(demo.collections.assignments);
    const demoCourseTitles = Object.values(demo.collections.courses).map((course) => course.title);
    const pageErrors = collectPageErrors(page);

    await page.addInitScript(
      (args) => {
        // The stale API cache is the shape the legacy upgrade path used to top up with demo homework.
        window.localStorage.setItem("lumina-school:api-cache", args.stale);
        window.localStorage.setItem("lumina-school:cache-owner", "admin@lumina.school");
        // A real local school, to prove the API boot leaves the local key alone.
        window.localStorage.setItem("lumina-school:v1", args.local);
      },
      { stale: JSON.stringify(stale), local: local.raw },
    );

    const session = await signIn(page, "admin@lumina.school");
    expect(session.bootstrap, "GET /school/bootstrap").toBe(200);

    const storage = await page.evaluate(() => ({
      local: window.localStorage.getItem("lumina-school:v1"),
      cache: window.localStorage.getItem("lumina-school:api-cache"),
    }));

    expect(storage.local, "API mode must not write the local key").toBe(local.raw);

    const cache = JSON.parse(storage.cache ?? "{}") as {
      collections?: Record<string, Record<string, unknown>>;
    };
    const cachedAssignments = cache.collections?.assignments ?? {};
    const leaked = demoAssignmentIds.filter((id) => id in cachedAssignments);
    expect(leaked, "no demo-seeded homework may enter an API session").toEqual([]);
    expect(
      Object.keys(cache.collections?.courses ?? {}),
      "the stale cached payload is replaced, never adopted",
    ).not.toContain(marker);

    await nav(page, "Settings");
    await expect(page.locator(".panel").first()).toBeVisible();
    await expect(
      page.locator('button:has-text("Reset demo")'),
      "the demo reset control is gone in API mode",
    ).toHaveCount(0);
    await expect(page.locator("text=Reset the demo school")).toHaveCount(0);

    const adminText = await page.locator("body").innerText();
    for (const title of demoCourseTitles) {
      expect(adminText, `demo course "${title}" must not render`).not.toContain(title);
    }

    expect(await signOut(page)).toBe(200);
    const student = await signIn(page, "student@lumina.school");
    expect(student.bootstrap).toBe(200);
    await nav(page, "Settings");
    await expect(page.locator('button:has-text("Reset data")')).toHaveCount(0);
    await expect(page.locator("text=Reset demo workspace")).toHaveCount(0);

    expect(await signOut(page)).toBe(200);
    const teacher = await signIn(page, "teacher@lumina.school");
    expect(teacher.bootstrap).toBe(200);
    await nav(page, "Settings");
    await expect(page.locator('button:has-text("Reset data")')).toHaveCount(0);
    await expect(page.locator("text=Reset demo workspace")).toHaveCount(0);

    assertNoPageErrors(pageErrors);
  });
});

/**
 * Store-level half of the guarantee. The app under test runs in the browser, so this probe uses the
 * same module in the Node worker with a memory adapter: no window, no dev server, no DB.
 */
test.describe("store guards in API mode", () => {
  test("resetSchool is inert and an API session starts empty", () => {
    configureSchoolStore(createMemoryAdapter(null));
    configureSchoolDataSource("api");
    const warnings: string[] = [];
    const originalWarn = console.warn;
    try {
      console.warn = (...args: unknown[]) => {
        warnings.push(args.map((value) => String(value)).join(" "));
      };
      const before = getSchoolSnapshot();
      expect(Object.keys(before.collections.users), "API mode starts empty").toEqual([]);
      expect(Object.keys(before.collections.assignments), "no demo homework at boot").toEqual([]);

      const sentinel = createSeedSchool();
      const after = resetSchool(sentinel);
      expect(after, "the snapshot is unchanged").toBe(before);
      expect(Object.keys(after.collections.lessons)).toEqual([]);
      expect(Object.keys(after.collections.users)).toEqual([]);
      expect(warnings).toContain("Lumina: demo reset ignored in API mode.");
    } finally {
      console.warn = originalWarn;
      configureSchoolDataSource("local");
    }
  });
});
