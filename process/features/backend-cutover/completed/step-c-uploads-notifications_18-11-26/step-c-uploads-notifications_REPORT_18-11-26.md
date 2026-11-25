---
phase: step-c-uploads-notifications-execute
date: 2026-11-18
status: COMPLETE
feature: backend-cutover
plan: process/features/backend-cutover/completed/step-c-uploads-notifications_18-11-26/step-c-uploads-notifications_PLAN_18-11-26.md
---

# Step C - Uploads and Notifications - EXECUTE Report

TL;DR: All four workstreams are done and every gate is green: typecheck, lint, backend tests
(17/17), diff check, grep gate, smoke 13/13 domains / 343 checks (with a deliberate red run),
API-mode browser run 25/25, demo-mode regression 10/10, and a 390 px narrow-viewport pass 7/7.
One real defect surfaced during browser verification (an over-long notification id made
mark-all-read fail with 400) and was fixed. Nothing is committed. `process/context/` edits are
handed to UPDATE PROCESS.

## What Was Done

- **WS-U Uploads (U1-U7):**
  - `POST /uploads` now rejects MIME types outside pdf / image / msword / docx / pptx and files
    over 5 MB; the multipart limit in `app.ts` matches. Empty files are rejected.
  - `requestBlob` in `api/client.ts` (single-flight 401 refresh, no JSON parse on binary);
    `toApiError` refactored to take a `Response` so JSON and blob calls share error mapping.
  - New `school/api/uploads.ts` (FormData upload, blob download, filename from
    `Content-Disposition`) and shared `school/attachment-download.ts`
    (`downloadAttachmentFile`, `useAttachmentObjectUrl`) that all call sites use.
  - `services/uploads.ts` has an API branch that never touches IndexedDB; the unreachable
    duplicate branch in `attachFileToPlan` was removed.
  - `ManagerCurriculum`, `TeacherLessons`, and `ManagerApprovals` download through the shared
    helper. `view.attachmentView` returns `{ id, name, type }` (no data URL) in API mode;
    `TeacherLessonAttachment.dataUrl` is optional and cancellation evidence renders inline from
    an object URL with a download fallback.
- **WS-N Notifications (N1-N7):**
  - `notification_state` table (`user_id` PK/FK, `muted_categories text[]`, `read_ids text[]`,
    `updated_at`) via `db:generate`; generated file renamed to `0002_notification_state.sql`
    after deleting a redundant generated `ALTER TABLE credit_entries` line.
  - `GET /notifications/state` and partial `PATCH /notifications/state` (zod strict, category
    allowlist, 300-id cap via `normalizeReadIds`, upsert on conflict).
  - `activityNotification` + `mergeNotifications` (dedupe by `targetType:targetId`, newest
    first, derived copy wins, muted categories hide both sources, cap 30).
  - `useNotifications`: API mode fetches feed + state on mount and after each bootstrap refresh,
    optimistic `markRead`/`markAllRead` with PATCH, derived items kept when the feed request
    fails. Demo mode still uses `usePersonalValue`.
  - `ManagerSettings` hydrates mute state from the server and writes toggles through.
- **WS-S Smoke and tests (S1-S4):** new `uploads` domain (16 checks: multipart upload, metadata,
  plan attach, byte-identical download, 401, oversize, wrong type, no activity row) and
  `notifications` domain (21 checks: scoping, defaults, roundtrip, invalid category, id cap,
  401); `contract.test.ts` covers both routes plus 401s; smoke header/domain count updated.
- **V Verification:** gates, smoke, browser runs, diff/grep gates, `frontend/CUTOVER_PROGRESS.md`
  board + Step C checklist + 4 verification rows + change log, umbrella `CUTOVER_PLAN.md` Step C
  ticked, backlog note for attachment download scoping.

## Defect found and fixed during verification

- Mark-all-read silently failed in API mode: `PATCH /notifications/state` returned 400 because the
  "lessons without a plan" reminder id embedded every lesson UUID (`plans-<id>,<id>,...`,
  > 200 chars). The bell UI still showed 0 unread optimistically, so only the server check caught
  it. The id is now `plans-<count>-<first date>-<last date>`, which stays short and stable.
- Cosmetic: the evidence preview `<Image>` triggered a Next.js "width or height modified" warning
  in the dev server log; the inline style now sets both dimensions (fix applied after the browser
  runs, so the warning above predates it).

## What Was Skipped or Deferred

- `process/context/**` edits are deferred to UPDATE PROCESS. Suggested list:
  - `process/context/all-context.md`: mention `notification_state`, `GET/PATCH /notifications/state`,
    the 5 MB + MIME upload rule, and the smoke `uploads`/`notifications` domains.
  - `process/context/tests/all-tests.md`: backend vitest is now 4 files / 17 tests; smoke is
    13 domains / 343 checks.
  - Any uploads section that still says files live in IndexedDB should note API mode stores bytes
    under `UPLOAD_DIR` with metadata in `attachments`.
- Public download scoping was recorded as a backlog note instead of being implemented
  (`backlog/attachment-access-scope_NOTE_18-11-26.md`), per the plan's risk handling.

## Test Gate Outcomes

| Gate | Strategy | Result | Evidence |
|---|---|---|---|
| `npm run typecheck` | Fully-Automated | PASS | exit 0 (frontend + backend) |
| `npm run lint` | Fully-Automated | PASS | exit 0 |
| `npm run test --workspace @lumina/backend` | Fully-Automated | PASS | 4 files / 17 tests |
| `git diff --check` | Fully-Automated | PASS | exit 0 (line-ending notes only) |
| G-GREP | Fully-Automated | PASS | no `reset`/`push`/`truncate` in the added lines |
| G-SMOKE | Fully-Automated | PASS | 13/13 domains, 343 checks, settings restored 24/true |
| G-SMOKE-RED | Fully-Automated | PASS | feed cap forced to 301: `FAIL notifications`, exit 1, reverted |
| G-BROWSER-API | Hybrid | PASS | 25/25: backend login + bootstrap, upload 201, byte-identical download, 30-item merged bell, read persists (32 ids, 0 unread after reload), mute persists, teacher evidence upload, manager evidence preview + download, no page errors |
| G-BROWSER-DEMO | Hybrid | PASS | 10/10: IndexedDB upload/download, localStorage read + mute survive reload, evidence stored as a data URL and rendered inline |
| G-BROWSER-MOBILE | Hybrid | PASS | 7/7 at 390×844: no overflow, bell fits, toggles render, plan modal upload works |
| G-MIGRATION | Fully-Automated | PASS | `db:generate` + reviewed SQL, `db:migrate` applied to the dev DB |
| G-DOC | Agent-Probe | PASS | umbrella Step C, progress board/checklist/log/change log, backlog note |

## Plan Deviations

- **D-1 Notification ids.** The plan assumed derived ids were short; the "plans" reminder was not.
  Fixed in the frontend rather than raising the backend id limit, so stored state stays bounded.
- **D-2 Migration file.** `db:generate` also emitted a redundant `ALTER TABLE credit_entries`
  statement (already applied in `0001`); removed by hand so the migration is exactly the new table.
- **D-3 Evidence preview style.** Minor CSS fix to silence a Next.js image warning.
- **D-4 Browser environment.** Next 16 allows one dev server per folder, so API-mode checks ran
  first, then the server was restarted with `.env.local` defaults for the demo regression.

## Test Infra Gaps Found

- No frontend unit runner, so `mergeNotifications`/`activityNotification` are covered only through
  browser behaviour and smoke; a pure-function test would be cheaper (existing
  `frontend-test-runner` backlog note covers this).
- Smoke leaves fixtures behind; the browser run left two pending cancellation requests and three
  uploaded plan files on the dev database (expected, no cleanup path yet).

## Handoff

- Archived plan: `process/features/backend-cutover/completed/step-c-uploads-notifications_18-11-26/`.
- UPDATE PROCESS applied: task folder archived, `process/context/` refreshed (all-context, tests,
  schema-and-models, migrations-workflow, school-data-layer).
- Remaining: commit Step C; then Step D (parity suite, one-time import, remove the fallback).

## UPDATE PROCESS (2026-11-18)

- **Archived** the task folder (`active/` -> `completed/`), fixed the report's plan/handoff paths,
  set the plan frontmatter to COMPLETE.
- **Context refreshed:** `all-context.md` (board status, smoke 13/343, upload + bell gotchas, open
  work now Step D, routing block regenerated), `tests/all-tests.md` (17 tests, 13 domains/343 checks,
  lint scope, last-verified row), `database/schema-and-models.md` (`notification_state`),
  `database/migrations-workflow.md` (`0002`), `uxui/school-data-layer.md` (`api/uploads.ts`,
  `api/notifications.ts`, `attachment-download.ts`).
- **Frontmatter backfill:** added `name`/`description`/`keywords`/`related` to `all-context.md`,
  `tests/all-tests.md`, and `planning/all-planning.md` (clears the three keyword warnings).
- **Routing block:** regenerated to the generator's contract (5 group entrypoints + 5 group rows,
  `read_when` overrides honoured). A POSIX-normalized replica of `discover-context.mjs` reproduces
  the on-disk block byte-for-byte, because the kit script cannot emit it correctly on Windows.
- **Audits:** `validate-all-context.mjs` clean; `validate-protocol-discovery.mjs` clean (22 docs);
  `validate-plan-inventory.mjs` exit 0 (real inventory: 0 active, 2 completed);
  `validate-context-discovery.mjs` warnings 0, 18 failures all traced to two pre-existing harness
  issues. Recorded in
  `process/general-plans/backlog/harness-windows-path-and-agents-skills_NOTE_18-11-26.md`:
  1. kit `walk`/`groupOf`/`includes("/active/")` path-separator bugs (3 validators mis-report on
     Windows; not caused by Step C and not fixed locally to avoid diverging from the remote kit);
  2. `.agents/skills` is a committed duplicate tree (339 identical files), not the symlink `AGENTS.md`
     and the validator assume;
  3. root router heading must follow the frontmatter with no blank line for
     `validate-all-context.mjs` to see it.
- **Nothing committed yet.** Cleanup left: commit Step C (`vc-git-manager` split), then Step D.
