---
phase: d1-parity-suite-execute
date: 2026-11-18
status: COMPLETE
feature: backend-cutover
plan: process/features/backend-cutover/active/d1-parity-suite_18-11-26/d1-parity-suite_PLAN_18-11-26.md
---

# D1 - Parity Suite - EXECUTE Report

TL;DR: The repo now has a committed browser suite: `npm run e2e` runs 9 API-mode specs against
the Postgres-backed build and 1 demo-mode regression, in ~50 s, and is green twice back to back
with no leftover processes. All eight Validate Contract rows pass, including a deliberate red run
that produced screenshot/video/trace and a precondition probe that failed loudly without touching
the database. No `frontend/app/**` file changed and no `data-testid` was added. Two real tooling
defects surfaced and were fixed (Playwright artifacts broke `npm run lint`; a `tsx watch` child
survived a failed backend boot on Windows). CI wiring is deferred to a backlog note because the
repo has no pipeline. Nothing is committed yet.

## What Was Done

- **Dependency and scripts.** `@playwright/test@1.65.1` pinned exactly (`--save-exact`) in the
  frontend workspace so it matches the Chromium already cached on this machine (no browser
  download, 75 packages added, 0 browsers fetched). Frontend scripts `e2e:api`, `e2e:demo`, `e2e`;
  root alias `npm run e2e`. `.gitignore` gained `test-results/`, `playwright-report/`,
  `blob-report/`.
- **Two configs, one launcher.** `frontend/playwright.config.ts` (app on :3000 with
  `NEXT_PUBLIC_DEMO_MODE=false` + `NEXT_PUBLIC_DATA_SOURCE=api`, backend on :4000 as a second
  `webServer`) and `frontend/playwright.demo.config.ts` (app on :3100, demo defaults, no backend).
  `frontend/e2e/serve.mjs` injects the mode env and spawns `next dev`, because Next inlines
  `NEXT_PUBLIC_*` at server start and `npm` runs under `cmd.exe` on Windows where `VAR=value cmd`
  is not portable. Both runs are sequential (`workers: 1`) and each asserts its own mode.
- **Support modules.** `e2e/support/api.ts` (login, bootstrap, `creditBalance`,
  `notificationState`/`saveNotificationState`, `lessonAt`, `cancellationRequestFor`),
  `auth.ts` (`signIn`/`signOut` returning the proving HTTP statuses), `fixtures.ts` (`runId`,
  PDF/PNG buffers with the run id embedded, download byte capture, page-error collector, nav/
  toast helpers), `flows.ts` (`isoDaysFromNow`, `longDate`, `openEditableCourse`,
  `uploadPlanFile`, `openTeacherSlot`, `openTeacherLesson`), `preconditions.ts` (memoised
  environment gate that fails loudly and never repairs).
- **Specs (10 tests).**

  | Spec | Tests | What it proves |
  |---|---|---|
  | `api/auth.spec.ts` | 3 | `POST /auth/login` 200 + `GET /school/bootstrap` 200; no access token or refresh cookie readable from `localStorage`/`document.cookie`; wrong password keeps the form and the error is non-empty; logout 200 then reload stays signed out |
  | `api/uploads.spec.ts` | 1 | Unique PDF → `POST /uploads` 201 with exact name/size, plan row renders, authenticated download is byte-identical |
  | `api/notifications.spec.ts` | 2 | Mark-all-read reaches `/notifications/state` and survives reload; muting "Students running low on credits" persists per user; original state restored in `finally` |
  | `api/booking.spec.ts` | 1 | Teacher opens a fresh future slot, student books it in the dialog, `creditBalance` delta is exactly `-1`, bootstrap shows a `scheduled` lesson for that teacher/date/time, card appears in Upcoming |
  | `api/cancellation-refund.spec.ts` | 1 | Teacher opens a slot → manager books it on behalf (marker in the comment) → teacher files a cancellation with PNG evidence → manager finds the row, sees the evidence as an authenticated `blob:` URL and downloads it → approves → credit delta exactly `+1`, lesson `cancelled`, request `approved` |
  | `api/homework.spec.ts` | 1 | Teacher assigns a uniquely titled homework → student submits → teacher reviews → status `Reviewed` and the Review button is gone |
  | `demo/regression.spec.ts` | 1 | Any-password login, `lumina-school:v1` + `lumina-account` present, IndexedDB upload + byte-identical download, mark-all-read and mute survive a reload, **zero** `/api/v1/` requests |

- **Server-state assertions.** Specs do not trust the UI alone: credit deltas come from
  `GET /credits/balance/:id`, lesson and request status from `GET /school/bootstrap`, and read/mute
  state from `GET /notifications/state`.
- **Docs (V4).** `frontend/PROGRESS.md` (status line + verification commands incl. e2e),
  `process/context/tests/all-tests.md` (commands, 4-tier map, new Parity Suite section, known gaps,
  last verified), `process/context/all-context.md` (test stack, workflow gates, dev commands,
  routing row), `frontend/CUTOVER_PROGRESS.md` (board row, D1 checklist, 2 verification rows,
  change log, next action), backlog note for CI wiring.

## Defects found and fixed during execution

1. **Playwright artifacts broke `npm run lint`.** The HTML report ships a bundled trace viewer
   (`playwright-report/api/trace/assets/*.js`), and ESLint's flat config only ignores what
   `globalIgnores` lists, not `.gitignore`. After the first failing run, `npm run lint` reported
   2955 problems (133 errors). Added `playwright-report/**`, `test-results/**`, `blob-report/**`
   to `frontend/eslint.config.mjs`; lint is clean again even with artifacts on disk.
2. **`tsx watch` survived a failed backend boot.** When the backend `webServer` failed with
   `EADDRINUSE` (a stale server held :4000), the npm wrapper and its detached `tsx watch` child
   stayed alive and kept the port. The `webServer` command is now
   `npm run start --workspace @lumina/backend` (no watcher, and the suite never edits backend
   source); after both final full runs, zero node processes remained and all three ports were
   free.
3. **Spec-authoring fixes (not product bugs).**
   - `openEditableCourse` waited for `.plan-files` inside its probe loop, so every plan-less
     seeded course burned 8 s and one run took 60 s. It now uses `button.course-back` as the
     "detail view is up" signal and checks `.course-plan-main` synchronously: 60 s → 4.9 s.
   - `homework.spec.ts` asserted the profile modal closed after review; the app legitimately
     re-renders the student profile, so the spec now asserts `.teacher-homework-status` is
     "Reviewed" with no Review button — the outcome that matters.
4. **Pre-existing, reported not fixed:** Next logs `Image with src "blob:..." has either width or
   height modified` when the manager previews cancellation evidence. Cosmetic, same class as the
   Step C observation, out of D1 scope.

## What Was Skipped or Deferred

- **CI wiring.** Umbrella item "add … to CI" cannot be satisfied: the repo has no CI provider or
  pipeline config. Recorded with the exact job shape (Postgres service, `npm ci`, `db:migrate`,
  `db:seed`, `npm run e2e`, artifact upload on failure, `CI=1`, `playwright install --with-deps
  chromium`) in `process/features/backend-cutover/backlog/e2e-ci-wiring_NOTE_18-11-26.md`.
- **`storageState` reuse.** Each spec signs its actors in through the UI (`reuseExistingServer` +
  cookie jar would save ~2 s per test). Kept explicit because the login screen is part of what is
  being verified.
- **D2/D3.** One-time import and local-fallback removal were out of the approved scope.
- **AGENTS.md feedback block.** `frontend/AGENTS.md` lost its `nextjs-agent-feedback` block in the
  working tree during dev-server runs; next.config still enables `agentFeedback`. Left out of this
  commit and flagged for the user rather than committing an owner-enabled feature out.

## Test Gate Outcomes

| Gate | Strategy | Result | Evidence |
|---|---|---|---|
| C1 `npm run e2e` | Hybrid | PASS | API 9/9 + demo 1/1, exit 0 |
| C2 twice back to back | Hybrid | PASS | run 1 41.0 s + 10.0 s, run 2 40.6 s + 10.0 s, no cleanup between |
| C3 failure artifacts | Fully-Automated | PASS | forced `toBe(201)` on login: exit 1, `test-failed-1.png` (113 KB), `video.webm` (140 KB), `trace.zip` (630 KB), `error-context.md`; reverted |
| C4 no destructive DB work | Fully-Automated | PASS | grep over `frontend/e2e/**`: no `reset`/`truncate`/`push`/`db:reset` (only in-memory `.push()` and prose) |
| C5 no behavior change | Agent-Probe | PASS | no `frontend/app/**` file touched; no `data-testid` added; `eslint.config.mjs` ignore list is the only app-side config edit |
| C6 repo gates | Fully-Automated | PASS | `typecheck` exit 0; `lint` exit 0; backend 4 files / 17 tests; `git diff --check` exit 0 |
| C7 docs reflect reality | Agent-Probe | PASS | all four docs updated with the real counts, commands, and the CI gap |
| C8 preconditions fail loudly | Hybrid | PASS | `E2E_API_URL=http://localhost:4999/api/v1`: all 3 auth tests failed in `beforeAll` with "Precondition failed: the backend is not reachable at http://localhost:4999. Start it with `npm run dev:api` …"; nothing seeded or repaired |
| Artifact hygiene | Fully-Automated | PASS | `test-results/`, `playwright-report/`, `blob-report/` gitignored and lint-ignored |

## Plan Deviations

- **D-1 Playwright exact pin.** Plan said `@playwright/test@1.65.1`; an initial install recorded
  `^1.65.1`, re-installed with `--save-exact` so a later `npm install` cannot pull a version whose
  browser build is not cached.
- **D-2 Backup restore hook.** Plan named `afterAll`; implemented as `finally` inside each
  notifications test so a mid-test failure still restores the captured state.
- **D-3 Backend launcher.** `npm run dev` → `npm run start` in the API config (defect 2 above).
- **D-4 ESLint ignore list.** Not in the plan; required once reports are generated locally
  (defect 1 above).
- **D-5 Context docs inside EXECUTE.** The plan told EXECUTE to leave `process/context/**` alone,
  but V4 explicitly requires `tests/all-tests.md` and the user's request covered the doc set, so
  both context files were updated here; UPDATE PROCESS should verify rather than redo.

## Residue left in the dev database

Each `npm run e2e` leaves, by design and without cleanup:

- one uploaded plan PDF per API upload run, attached to the "Browser probe course" plan (the demo
  spec uploads into IndexedDB, not Postgres);
- one `scheduled` lesson on day +4 (booking spec; slot opened at 23:30);
- one booked-then-cancelled lesson on day +6 with an `approved` cancellation request and a refund
  ledger entry (cancellation/refund spec);
- one `reviewed` assignment titled `E2E homework <runId>`;
- `notification_state` churn for the admin user, restored to the captured values.

Unique `runId` markers make every row attributable to a run. A disposable test database is the
only real fix; that is the same gap the smoke suite has.

## Handoff

- Plan: `process/features/backend-cutover/active/d1-parity-suite_18-11-26/d1-parity-suite_PLAN_18-11-26.md` (all boxes ticked).
- Report: this file.
- Next: UPDATE PROCESS (archive the task folder, re-run the context/plan audits, close the D1
  board row), then plan D2 (one-time import) and D3 (fallback removal).
