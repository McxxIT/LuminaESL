---
phase: d1-parity-suite-execute
date: 2026-11-18
status: COMPLETE
feature: backend-cutover
plan: process/features/backend-cutover/completed/d1-parity-suite_18-11-26/d1-parity-suite_PLAN_18-11-26.md
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

- Plan: `process/features/backend-cutover/completed/d1-parity-suite_18-11-26/d1-parity-suite_PLAN_18-11-26.md` (all boxes ticked).
- Report: this file.
- Archived: `process/features/backend-cutover/completed/d1-parity-suite_18-11-26/`.
- Next: plan D2 (one-time import) and D3 (fallback removal).

## UPDATE PROCESS (2026-11-18)

TL;DR: D1 is archived and the cutover docs stop claiming the suite does not exist. The only code
touched was kit tooling: six audit-script fixes (four Windows path bugs plus two CRLF/correctness
bugs), which turned `validate-protocol-wiring` from 9 false warnings into a real check and exposed a
missing 12-file protocol index (added). Nothing under `frontend/`, `backend/`, or `package.json`
changed.

### What Was Done

- **Archived** the task folder with `git mv`:
  `active/d1-parity-suite_18-11-26/` -> `completed/d1-parity-suite_18-11-26/` (folder name unchanged,
  no `completed_` prefix). Plan frontmatter is now `COMPLETE (EXECUTE + UPDATE PROCESS done
  18-11-26; archived)`; the plan's "Resume and Execution Handoff" and the report's frontmatter
  `plan:` + Plan Link now point at `completed/`.
- **Context refreshed (6 files):**
  - `all-context.md` - Tests row (9 API + 1 demo, not "10 in both modes"), planning row (D1 done),
    Open Questions (D1 done; D2/D3 open; no unit runner; no CI), dropped the stale "large
    uncommitted cutover work" gotcha, regenerated the `GENERATED:routing` block.
  - `tests/all-tests.md` - frontmatter description now names the parity suite (this is what the
    generator emits), BLUF rewritten (the frontend is no longer test-less), stray generator footer
    removed.
  - `uxui/all-uxui.md`, `uxui/styling-tailwind4.md` - "no frontend tests" replaced with the parity
    suite plus the real remaining gap (no unit/component runner).
  - `planning/all-planning.md` - cutover row no longer contradicts itself ("Step C next ... Step C
    not started" replaced with A-C + D1 done, D2/D3 next); footer removed.
  - `auth/demo-vs-api-mode.md` - closing cutover-progress line updated.
- **Backlog truth:** `e2e-ci-wiring_NOTE` `status: deferred` -> `BLOCKED`;
  `attachment-access-scope_NOTE` `status: open` -> `BLOCKED` (both were invalid for
  `validate-backlog-notes`). `frontend-test-runner_NOTE` rewritten: D1 closed the browser half;
  service-level local-branch assertions and the uncommitted B3 memory-adapter probe are still
  uncovered.
- **Umbrella truth:** `frontend/CUTOVER_PLAN.md` Step D item 1 is ticked with the D1 date and the
  deferred CI note; remaining bullets are labelled D2/D3. `frontend/PROGRESS.md` item 12 marked done
  and its "Step B in progress / Steps C and D" summary now reads A-C + D1 done, D2/D3 next.
- **Harness path fixes (approved item 9, plus two same-class discoveries):**
  - `vc-context-discovery/scripts/discover-context.mjs` - `path.posix.join` in `walk`, `/` splits in
    `groupOf` and the `--feature` grouping, CRLF-tolerant routing comparison.
  - `vc-audit-context/scripts/validate-context-discovery.mjs` - same walk fix, CRLF-tolerant
    frontmatter parser, root router included in the `related` slug registry.
  - `vc-audit-plans/scripts/validate-plan-inventory.mjs` - same walk fix; also filters to
    `PLAN`-named files so `_GUIDE.md`/`REPORT`/`SPEC` are not scored as plans.
  - `vc-audit-vc/scripts/validate-protocol-wiring.mjs` - same walk fix, which exposed real drift:
    `all-development-protocols.md` did not index the 12 `vc-system-behavior/*.md` files. Added the
    12-file map and removed the reference to a non-existent `archive/` copy of the monolith.
  - `vc-generate-context/scripts/validate-all-context.mjs` - CRLF-tolerant frontmatter strip (a
    Windows checkout made the router look like it had no top-level heading).
  - `vc-audit-plans/scripts/validate-backlog-notes.mjs` - skips `_GUIDE.md` folder guides, which are
    not backlog notes.
  - All six files mirrored byte-for-byte into `.agents/skills/` (the two trees are separate tracked
    copies, not a symlink).
- **`AGENTS.md`** now states the real `.agents/skills` shape (tracked copy, mirror edits by hand)
  instead of claiming a symlink.
- **Harness debt note**
  `process/general-plans/backlog/harness-windows-path-and-agents-skills_NOTE_18-11-26.md` updated:
  finding 1 (path bugs) marked fixed locally with an upstream `vc-publish` step; open items are the
  duplicate skill tree and `validate-guide-sync` expecting a skill catalog in a product README.

### What Was Skipped/Deferred

- **CI wiring** for the parity suite - still deferred: `e2e-ci-wiring_NOTE_18-11-26.md`.
- **D2 (one-time import) and D3 (fallback removal)** - not started; next plans.
- **`validate-skills.mjs` failure** (`.agents/skills` is a duplicate tree) - deliberately not
  restructured; converting it needs a symlink-capable checkout or a validator change. Recorded in
  the debt note.
- **`validate-guide-sync.mjs` failure** - not fixed; the repo README is a product readme with no skill
  catalog, so the check is not applicable as written. Recorded, not papered over.
- **Re-running `npm run e2e`** - deliberately not re-run: no `frontend/**`, `package.json`, or
  backend file changed in this phase, so the C1/C2 evidence still stands.

### Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Plan inventory | `validate-plan-inventory.mjs --strict` | green - 0 active, 3 completed, 0 samples (was a vacuous 0/0 before the path fix) |
| Backlog notes | `validate-backlog-notes.mjs process/features/backend-cutover/backlog` | green - 0 warnings, 0 failures |
| Context discovery | `validate-context-discovery.mjs` | 16 docs / 266 refs, 0 warnings, 1 failure: `.agents/skills does not resolve to .claude/skills` (finding 2, accepted) |
| Routing block | `discover-context.mjs --check-routing` | green - in sync, 5 group entrypoints |
| All-context structure | `validate-all-context.mjs` | green - 0/0 |
| Protocol wiring | `validate-protocol-wiring.mjs` | green - 22 protocols, 15 agents, 0 warnings, 0 failures (was 9 false warnings) |
| Skills | `validate-skills.mjs` | red - duplicate skill tree (finding 2) |
| Guide sync | `validate-guide-sync.mjs` | red - README has no skill catalog (finding 4) |
| Agent parity | `validate-agent-parity.mjs` | green with pre-existing body-drift warnings |
| Plan artifact | `validate-plan-artifact.mjs <plan>` | 0 failures / 0 warnings on the plan content before archival; re-running on the archived path exits 1 with the scope guard ("not under .../active/"), which is expected for a completed plan |
| Whitespace | `git diff --check` | green |

Not run this phase: `npm run typecheck`, `npm run lint`, backend vitest, `npm run e2e`, `npm run smoke`
- no source or dependency change. Last green evidence is recorded in `tests/all-tests.md`.

### Plan Deviations

- The plan said "UPDATE PROCESS should verify, not redo" the context updates. Verified and corrected:
  five context docs still carried pre-D1 claims (the frontend has no tests; Step D not started), so
  this phase did edit them.
- The plan did not anticipate tooling work. Six kit scripts were patched because the Tier-1 context
  audit could not otherwise distinguish real drift from Windows path noise. Scope expansion was
  approved explicitly (item 9); the four extra same-class bugs were disclosed before they were fixed.
- `validate-plan-inventory` had been passing vacuously on Windows since before D1; this phase made it
  scan for real, so "0 active / 3 completed" is the first meaningful result.

### Test Infra Gaps Found

- Parity suite residue still lands in the dev DB (documented, attributable by `runId`).
- No unit/component runner for the frontend service layer -
  `frontend-test-runner_NOTE_18-11-26.md`.
- No CI job, so "green twice locally" is the strongest available evidence -
  `e2e-ci-wiring_NOTE_18-11-26.md`.
- The validator suite still cannot be fully green on this checkout (duplicate skill tree, README
  catalog assumption). Both are recorded and neither blocks the cutover.

### SPEC Achievement

n/a - D1 has no `*_SPEC_*.md`; the plan's Validate Contract rows were scored in the EXECUTE report.

### Closeout Packet

1. Selected plan path: `process/features/backend-cutover/completed/d1-parity-suite_18-11-26/d1-parity-suite_PLAN_18-11-26.md`
2. Closeout classification: **Archived - ready to move on**
3. What was finished: D1 parity suite (9 API + 1 demo, `npm run e2e`), docs, backlog notes, archive, context refresh, harness path fixes
4. Verified: suite green twice back to back; deliberate-red artifacts; loud preconditions; typecheck/lint/vitest; the validator set above. Unverified: CI wiring (no pipeline); frontend unit runner; D2/D3 behavior
5. Cleanup done: plan archived, paths fixed, context refreshed, backlog statuses corrected. Still needed: none for D1
6. Next valid state: **PLAN for D2** (one-time import) or D3 (fallback removal) - separate plans under `process/features/backend-cutover/active/`
7. Commit checkpoint: process commit only (this phase); the three D1 source commits are already on `developing`
8. Regression status: n/a (single-phase task, not a phase program)
9. SPEC achievement: n/a (no SPEC)

### Forward Preview

#### Test Infra Found

`npm run e2e` (root alias) -> API suite on :3000 + backend :4000, then demo regression on :3100.
`e2e:api` / `e2e:demo` per workspace. Preconditions fail loudly; notification state restored in
`finally`; the backend webServer uses `npm run start` (the `tsx watch` child leak is documented).

#### Blast Radius Changes

Beyond the plan: six `.claude/skills/**` script patches mirrored into `.agents/skills/**`,
`AGENTS.md` wording, one harness debt note, and the 12-file protocol index in
`process/development-protocols/all-development-protocols.md`. No `frontend/`, `backend/`, or
dependency change.

#### Commands to Stay Green

`npm run typecheck`; `npm run lint`; `npm run test --workspace @lumina/backend`;
`git diff --check`; `npm run e2e` (needs local Postgres, `backend/.env`, a seeded DB, ports
3000/3100/4000 free); `npm run smoke` for the domains the parity suite does not cover.

#### Dependency Changes

None this phase. D1 added `@playwright/test` `1.65.1` (exact) to `frontend/devDependencies` - no
browser download, matches the cached chromium build.
