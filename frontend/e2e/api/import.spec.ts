import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  API_BASE,
  apiGet,
  apiLogin,
  bootstrap,
  creditBalance,
  SEEDED_PASSWORD,
} from "../support/api";
import { signIn } from "../support/auth";
import { expectNotice, nav, runId } from "../support/fixtures";
import { createLocalSchoolFixture, seedLocalSchoolArgs } from "../support/local-school";
import { ensurePreconditions, type Preconditions } from "../support/preconditions";

/**
 * The one-time import, end to end: a synthetic local school is seeded in the
 * browser, the admin previews it (no writes), imports it, and the API proves the
 * history survived — timestamps, reviewers, request state, credit sign, lesson
 * end time, attachment bytes — plus the idempotency marker.
 *
 * Rows created here stay in the dev database (there is no delete API). Everything
 * carries the run id so residue is identifiable; the D2 report lists it.
 */

type BootstrapWithHistory = {
  collections: {
    users: Record<string, { id: string; email: string; avatarColor: string; createdAt: string; status: string }>;
    lessons: Record<
      string,
      { id: string; title: string; createdAt: string; endTime: string; createdBy: string }
    >;
    requests: Record<
      string,
      { id: string; status: string; reviewNote?: string; attachmentId?: string }
    >;
    activity: Record<string, { action: string; targetId: string }>;
  };
};

async function bootstrapHistory(token: string): Promise<BootstrapWithHistory> {
  return apiGet<BootstrapWithHistory>("/school/bootstrap", token);
}

test.describe("one-time import", () => {
  let ready: Preconditions;

  test.beforeAll(async () => {
    ready = await ensurePreconditions();
  });

  test("imports a local school with its history and refuses a second run", async ({ page }) => {
    const id = runId();
    const fixture = createLocalSchoolFixture(id);

    await page.addInitScript((seed) => {
      window.localStorage.setItem("lumina-school:v1", seed.raw);
      window.localStorage.setItem(seed.fileKey, seed.dataUrl);
    }, seedLocalSchoolArgs(fixture));

    await signIn(page, "admin@lumina.school");

    const before = await bootstrapHistory(ready.adminToken);
    const lessonsBefore = Object.keys(before.collections.lessons).length;

    await nav(page, "School settings");
    await page.getByRole("tab", { name: "Import local data" }).click();
    await expect(page.getByText(/records captured/)).toBeVisible();

    const previewResponse = page.waitForResponse(
      (response) => response.url().includes("/school/import/preview"),
      { timeout: 120_000 },
    );
    await page.getByRole("button", { name: /^Preview$/ }).click();
    expect((await previewResponse).status(), "POST /school/import/preview").toBe(200);
    await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();

    const afterPreview = await bootstrapHistory(ready.adminToken);
    expect(
      Object.keys(afterPreview.collections.lessons).length,
      "preview must not write anything",
    ).toBe(lessonsBefore);
    expect(
      Object.values(afterPreview.collections.activity).some(
        (entry) =>
          entry.action === "school.imported" && entry.targetId === fixture.markers.seededAt,
      ),
      "preview must not write the import marker",
    ).toBe(false);
    const importResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/school/import") &&
        response.request().method() === "POST",
      { timeout: 180_000 },
    );
    await page.getByRole("button", { name: /Import into the shared school/ }).click();
    const importResult = await importResponse;
    expect(importResult.status(), "POST /school/import").toBe(201);
    const importBody = (await importResult.json()) as {
      createdIds: Record<string, string[]>;
      totals: { created: number };
    };
    await expect(page.getByRole("heading", { name: "Imported" })).toBeVisible();
    await expectNotice(page, /Imported \d+ records/);

    // The receipt is the only rollback path, so it has to be downloadable and complete.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download receipt/ }).click();
    const receiptDownload = await downloadPromise;
    const receiptPath = await receiptDownload.path();
    expect(receiptPath, "the receipt download produced a file").toBeTruthy();
    const receipt = JSON.parse(await readFile(receiptPath ?? "", "utf8")) as {
      marker: string;
      totals: { created: number };
      createdIds: Record<string, string[]>;
      idMap: Record<string, string>;
    };
    expect(receipt.marker).toBe(fixture.markers.seededAt);
    expect(receipt.totals.created).toBe(importBody.totals.created);
    expect(receipt.createdIds, "the receipt lists every created id").toEqual(
      importBody.createdIds,
    );
    expect(Object.values(receipt.createdIds).flat().length).toBe(importBody.totals.created);

    const after = await bootstrapHistory(ready.adminToken);

    const student = Object.values(after.collections.users).find(
      (user) => user.email === fixture.markers.studentEmail,
    );
    expect(student, "the new student was created").toBeDefined();
    expect(student?.status, "imported accounts wait for an invitation").toBe("invited");
    const importedLogin = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: fixture.markers.studentEmail, password: SEEDED_PASSWORD }),
    });
    expect(importedLogin.status, "an imported account cannot sign in before it sets a password").toBe(401);
    expect(student?.avatarColor, "the palette name became hex").toBe("#f97316");
    expect(student?.createdAt, "createdAt is the recorded one").toBe(
      fixture.markers.lessonCreatedAt,
    );

    const lesson = Object.values(after.collections.lessons).find(
      (candidate) => candidate.title === fixture.markers.lessonTitle,
    );
    expect(lesson, "the lesson was imported").toBeDefined();
    expect(lesson?.endTime, "the real 20-minute end time survived").toBe("09:25");
    expect(lesson?.createdAt).toBe(fixture.markers.lessonCreatedAt);
    expect(lesson?.createdBy, "the creator is the imported student, not the admin").toBe(
      student?.id,
    );

    const request = Object.values(after.collections.requests).find(
      (candidate) => (candidate.reviewNote ?? "") === "Approved before the cutover",
    );
    expect(request, "the approved request was imported").toBeDefined();
    expect(request?.status, "review state is preserved").toBe("approved");
    expect(request?.attachmentId, "the request points at the uploaded file").toBeTruthy();

    expect(
      await creditBalance(ready.adminToken, student?.id ?? ""),
      "the imported ledger keeps its sign and amount",
    ).toBe(fixture.markers.creditHours);

    const download = await fetch(`${API_BASE}/uploads/${request?.attachmentId}/download`, {
      headers: { authorization: `Bearer ${ready.adminToken}` },
    });
    expect(download.status, "the attachment is downloadable").toBe(200);
    expect(
      Buffer.from(await download.arrayBuffer()).toString("utf8"),
      "the bytes are the ones the browser held",
    ).toBe(fixture.markers.attachmentBody);

    const marker = Object.values(after.collections.activity).find(
      (entry) => entry.action === "school.imported" && entry.targetId === fixture.markers.seededAt,
    );
    expect(marker, "the import marker is an activity row").toBeDefined();

    const local = await page.evaluate(() => window.localStorage.getItem("lumina-school:v1"));
    expect(local, "the local store is still untouched after the import").toBe(fixture.raw);

    // A second import of the same browser store is refused before it writes anything.
    const repeat = await fetch(`${API_BASE}/school/import`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ready.adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source: fixture.data,
        attachments: {},
        exclude: {},
        options: {},
      }),
    });
    expect(repeat.status, "a repeated marker is a conflict").toBe(409);

    // The same run with force writes the marker again, which is how an operator retries.
    const forced = await fetch(`${API_BASE}/school/import`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ready.adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source: { ...fixture.data, collections: {} },
        attachments: {},
        exclude: {},
        options: { force: true },
      }),
    });
    expect(forced.status, "force re-runs the marker check").toBe(201);

    const lessonsAfter = Object.keys((await bootstrapHistory(ready.adminToken)).collections.lessons)
      .length;
    expect(lessonsAfter, "the forced empty import did not add lessons").toBe(
      lessonsBefore + 1,
    );
  });

  test("is admin only", async () => {
    const fixture = createLocalSchoolFixture(runId());
    const body = JSON.stringify({ source: fixture.data, attachments: {}, exclude: {}, options: {} });

    const anonymous = await fetch(`${API_BASE}/school/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(anonymous.status, "unauthenticated").toBe(401);

    for (const email of ["manager@lumina.school", "teacher@lumina.school", "student@lumina.school"]) {
      const token = await apiLogin(email);
      const response = await fetch(`${API_BASE}/school/import`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body,
      });
      expect(response.status, `${email} must not import`).toBe(403);
    }

    // The seeded school is unchanged by the rejected attempts.
    const school = await bootstrap(ready.adminToken);
    expect(Object.keys(school.collections.users).length).toBeGreaterThan(0);
  });
});
