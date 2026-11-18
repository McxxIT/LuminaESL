---
phase: b3-domain-smoke-execute
date: 2026-11-18
status: COMPLETE_WITH_GAPS
feature: backend-cutover
plan: process/features/backend-cutover/active/b3-domain-smoke_18-11-26/b3-domain-smoke_PLAN_18-11-26.md
---

# B3 Domain Smoke - EXECUTE Report

TL;DR: All four workstreams are code-complete and every gate I ran is green: typecheck, lint, backend tests (16/16), diff check, two consecutive smoke runs (11/11 domains, 306 checks each), a deliberate red run (exit 1), and demo plus API browser checks. The remaining gaps are the user-accepted ones, plus one new finding (POST /lessons does not debit). The `process/context/` doc edits are handed to UPDATE PROCESS. Nothing is committed.

## Mid-implementation progress note

At about 50% (WS-B and WS-F done, gates green; WS-S and V remaining), two deviations had come up, D-1 (homework re-review 400, required by SPEC #17) and D-4 (course action typing). I recorded both and continued.

## What Was Done

- **WS-B (B1-B15):** postgres `numeric` parser (`pgTypes`, `from: [1700]`); `RATE_LIMIT_MAX` env (default 300) and Env literals in both test files; `getCreditBalance`; `resolveLessonDefaults` used by POST /bookings (in its txn) and POST /lessons (omitted fields only); typed `ActivityAction` superset union; `logActivity(db | tx)`; raw activity inserts moved to `logActivity` (bookings, credits, requests, assignments x3); logging for slot open/close, closure-approve `slot.closed`, rebook/POST /lessons `lesson.booked`, reschedule, request created/withdrawn; complete rejects a cancelled lesson (409); request lesson-ownership check (404 unknown, 403 foreign); approve-cancel guards (pending predicate, lesson `FOR UPDATE`, completed 409, cancelled no refund). E9 confirmed: backend `notifications.ts` has no unit math and was not edited.
- **WS-F (F1-F7):** `api/teaching.ts` `rateLesson` + `uploadDataUrlAttachment`; `rateLesson` dual-branch; request-cancellation API path uploads first, then files the request with `attachmentId`; `LESSON_CREDIT_HOURS = 1`; `LOW_CREDIT_HOURS = 2`; billing/overview lesson counts; seed reconcile 24; `data.ts` packages and refund; `LuminaApp` 24; local approve-cancel refuses a completed lesson; `SCHOOL_SCHEMA_VERSION` 3 in both constants.
- **WS-S (S1-S6):** `backend/scripts/smoke.ts`; `smoke` scripts (backend + root alias); tsconfig include and lint path cover `scripts/`.
- **V:** gates, smoke x2 + red, browser checks, evidence pack (`harness/`, validator 0 warnings/0 failures), `frontend/CUTOVER_PROGRESS.md`, 6 backlog notes.

## What Was Skipped or Deferred

- `process/context/` edits (E7 / V5) are deferred to UPDATE PROCESS (D-3). Exact list:
  - `process/context/all-context.md` "Observed booking risks": drop the `sum(hours)::int` truncation bullet (stale since 6819b3d; balance is now a numeric `getCreditBalance`). Add `RATE_LIMIT_MAX` to the backend env names and `npm run smoke` to Dev commands and Fully-automated gates (note: it needs local Postgres + the backend env file).
  - `process/context/database/booking-and-credit-integrity.md` L16 and L35: same stale `::int` claims. Note the numeric parser in `plugins/db.ts`, `getCreditBalance`, the approve-cancel guards, and 1 credit per lesson in demo mode.
  - `process/context/tests/all-tests.md` L101 Known Gaps and the test count: backend vitest is now 4 files / 16 tests (new `db-types.test.ts`). Add the smoke gate (command, port 4100, guards, not in CI).

## Test Gate Outcomes

| Gate | Strategy | Result | Evidence |
|---|---|---|---|
| `npm run typecheck` | Fully-Automated | PASS | exit 0 |
| `npm run lint` | Fully-Automated | PASS | exit 0 (backend now `eslint src tests scripts`) |
| `npm run test --workspace @lumina/backend` | Fully-Automated | PASS | 4 files, 16 tests; db-types red-first confirmed (4/4 failed before B1/B3) |
| `git diff --check` | Fully-Automated | PASS | exit 0 |
| G-SMOKE-RUN / G-SMOKE-TWICE | Fully-Automated | PASS | runs `mwlgvlrl51c9`, `mwlgvwz0f90b`: 11/11 domains, 306 checks, exit 0, settings restored 24/true |
| G-SMOKE-RED | Fully-Automated | PASS | booking delta set to -2: `FAIL booking`, 10/11, exit 1; reverted from backup |
| G-GREP | Fully-Automated | PASS | no output |
| FE-PARITY | Agent-Probe | PASS | Node probe on the real local services: 11/11 |
| G-BROWSER-DEMO | Hybrid | PASS | v2 store re-seeded to v3 at 24; UI book 24.0 -> 23.0, cancel -> 24.0 |
| G-BROWSER-API | Hybrid | PASS | 4 role shells load; UI book -1, cancel +1; teacher page shows room code + plan; student rating stored (1 row, 1 `lesson.rated`) |
| RISK-PACK | Agent-Probe | PASS | `harness/` 5 files, validator clean |
| G-DOC | Agent-Probe | PASS | `frontend/CUTOVER_PROGRESS.md` board, checklist, 3 verification rows, change log, contract notes |

Smoke domains: settings 7, slots 20, booking 25, on-behalf 13, rebook 15, lessons 55, requests 71, credits 55, homework 16, quality 10, profile 19.

## Plan Deviations

D-1 through D-7 are listed in the plan's `## Deviations` section. Summary: D-1 homework re-review 400 (SPEC #17); D-2 shared `DbOrTx` type file; D-3 context docs deferred; D-4 course action typing; D-5 PeopleForms hint; D-6 FE-PARITY via Node service probe + browser; D-7 browser checks from a temporary frontend copy.

## Test Infra Gaps Found

- No frontend test runner (R1); the FE-PARITY probe was a one-off. Backlog: `frontend-test-runner_NOTE_18-11-26.md`.
- Smoke not in CI and leaves fixtures. Backlog: `smoke-ci-and-fixtures_NOTE_18-11-26.md`.
- Next 16 allows only one dev server per project folder, so browser checks cannot run next to a running `npm run dev`. A temporary copy inside the repo root worked; a copy outside the repo did not (Turbopack cannot resolve `next` through a junction).
- `process/features/backend-cutover/backlog/_GUIDE.md` fails `validate-backlog-notes.mjs` (template has no status/item/reason). This predates B3.

## Closeout Packet

- Selected plan: `process/features/backend-cutover/active/b3-domain-smoke_18-11-26/b3-domain-smoke_PLAN_18-11-26.md`
- Finished: WS-B, WS-F, WS-S, V1-V4, and V5 except the `process/context/` edits.
- Verified: everything in Test Gate Outcomes above. Unverified: the independent EVL rerun, and user confirmation.
- Remaining cleanup: UPDATE PROCESS context edits (D-3 list), the commit (orchestrator), archive after EVL.
- Classification: **Keep in active/testing** until the vc-tester EVL rerun is green, then ready for UPDATE PROCESS archival.
- Follow-up stubs: `process/features/backend-cutover/backlog/{booking-credit-concurrency,smoke-ci-and-fixtures,credit-hours-wording,rebook-enrichment,frontend-test-runner,booking-rules-followups}_NOTE_18-11-26.md`.
- CONTEXT_PARTIAL: none.

## Forward Preview

### Test Infra Found
- `npm run smoke` (root) / `npm run smoke --workspace @lumina/backend`: needs local Postgres + the backend env file, port 4100 free (`SMOKE_PORT`), takes about 1 minute.
- `backend/tests/db-types.test.ts` (DB-free).
- Local services can be driven in Node with `configureSchoolStore(createMemoryAdapter())`; tsx needs a `.mts` file and `file:///` import URLs on Windows.

### Blast Radius Changes
- New: `backend/src/lib/{credits,lesson-defaults,db-handle}.ts`, `backend/scripts/smoke.ts`, `backend/tests/db-types.test.ts`.
- Public API: balance number, `lesson.booked` for POST /lessons, new 4xx rejections (complete-cancelled 409, foreign-lesson request 403/404, approve-completed 409, second review 409, homework re-review 400). `SCHOOL_SCHEMA_VERSION` 3.

### Commands to Stay Green
`npm run typecheck`; `npm run lint`; `npm run test --workspace @lumina/backend`; `git diff --check`; `npm run smoke` (twice).

### Dependency Changes
None (no new packages). Browser checks used the scratch `playwright-core` outside the repo.

## Environment notes

- Servers I started (frontend :3100, backend :4200, smoke :4100) are all stopped. Env files were not read or edited. `.b3-browser-fe/` was deleted.
- A pre-existing `next dev` on :3000 (PID 27120, not started by this agent) was found running at the start of V3 and was no longer running at the end. I never targeted it: I killed only the :3100/:4200 listener process trees. The cause is unknown.
- Dev DB rows left behind: smoke fixtures (archived users) from three runs; browser probe: one archived probe student and its course; one completed "Agent probe rating lesson" for Mia with a 5-star rating; Mia's probe booking was cancelled with a refund (balance back to 21.25).

---

# UPDATE PROCESS Closeout (18-11-26)

## What Was Done (UPDATE PROCESS)

- D-3 context edits applied: `process/context/all-context.md` (stale `::int` risk replaced; `POST /lessons` no-debit finding added; `RATE_LIMIT_MAX`; `npm run smoke` in dev commands and gates; studentCredits note corrected to 24), `database/booking-and-credit-integrity.md` (getCreditBalance, numeric parser, resolveLessonDefaults, approve-cancel guards, 1 credit per lesson), `tests/all-tests.md` (16 tests / 4 files, new Smoke Gate section, known gaps, last run), `auth/demo-vs-api-mode.md`, `uxui/app-shell-and-roles.md`, `uxui/school-data-layer.md`, `planning/all-planning.md`.
- `frontend/CUTOVER_PROGRESS.md`: B3 row Done, mutation-smoke checkbox ticked, EVL rerun verification row added, next action now Step C. Activity names `lesson.booked` and `lesson.planChanged` remain recorded.
- Feature `_GUIDE.md` status updated. Plan status and D-3 marked resolved. Task folder moved to `completed/`.

## Closeout Packet

1. Selected plan: `process/features/backend-cutover/active/b3-domain-smoke_18-11-26/b3-domain-smoke_PLAN_18-11-26.md` (now under `completed/`)
2. Classification: Ready for UPDATE PROCESS archival, WITH_GAPS (user-accepted CONDITIONAL residuals only)
3. Finished: WS-B, WS-F, WS-S, V1-V5, context reconciliation
4. Verified: independent vc-tester rerun green (typecheck, lint, vitest 16/16, diff check, smoke x2 11 domains / 306 checks, grep gate, scripts excluded from npm test, settings restored, port 4100 free). Unverified by tester: browser gates (execute log only), G-SMOKE-RED, G-DOC (G-DOC re-checked here by reading CUTOVER_PROGRESS).
4b. Validate-contract: present in plan, Gate CONDITIONAL, residuals accepted by user
5. Cleanup done: context, board, guide, archive. Still needed: commit (orchestrator).
6. Next valid state: commit via vc-git-manager, then Step C (uploads and notifications) plan
7. Commit checkpoint: Execution commit recommended, then process commit. Split: (a) code + tests: `backend/**` (incl. new `backend/scripts/`, `src/lib/{credits,db-handle,lesson-defaults}.ts`, `tests/db-types.test.ts`), `frontend/app/**`, `package.json`; (b) docs/process: `process/**`, `frontend/CUTOVER_PROGRESS.md`. Do NOT commit `.claude/hooks/.logs/hook-log.jsonl`.
8. Regression status: covered by the full gate set above; no failures.
9. SPEC achievement: criteria 1-3, 5-15, 17, 19, 20 met by passing automated gates; 4 met (doc verified); 11 and 18 met (automated smoke plus passing hybrid browser check). Criterion 16 (demo/local branch 1 credit per lesson): automated typecheck/lint pass, but the behavior is proven only by Agent-Probe plus browser (no frontend test runner). Under the vacuous-green rule this part is UNMET as an automated gate; residual strategy Agent-Probe; backlog stub `frontend-test-runner_NOTE_18-11-26.md` exists. Archived because the user explicitly accepted R1 in the validate-contract and every backend developed behavior is proven by passing automated gates.

Drift score: HIGH (4 signals: 30+ files touched, `process/` and CLAUDE-level docs unchanged but backlog NOTEs written + task folder archived, validate-contract deviations D-1..D-7, 3+ memory-worthy observations).
Strongly recommend UPDATE PROCESS -- harness/protocol files touched. (Harness files were not edited; UPDATE PROCESS has now run.)

## Forward Preview
Commands to stay green: `npm run typecheck`; `npm run lint`; `npm run test --workspace @lumina/backend`; `git diff --check`; `npm run smoke` (needs local Postgres, port 4100 free). Step C should extend the smoke with uploads and notifications.
