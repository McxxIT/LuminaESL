---
name: plan:d1-parity-suite
description: "COMPLEX plan: in-repo Playwright parity suite for the six umbrella flows, API mode plus demo regression, runnable with one command"
date: 18-11-26
feature: backend-cutover
status: COMPLETE (EXECUTE done 18-11-26; awaiting UPDATE PROCESS)
---

# D1 — Parity Suite

**Date**: 18-11-26
**Status**: COMPLETE — executed 18-11-26; every gate green, report written.
**Complexity**: COMPLEX (new browser-test workspace, two run modes, self-contained fixtures, no CI exists yet)
**Branch**: developing
**Umbrella**: `frontend/CUTOVER_PLAN.md` §Step D item 1 (parity suite in CI) and `frontend/CUTOVER_PROGRESS.md` board row "D1".
**Execution Model**: single vc-execute-agent, sequential: P1 harness + proven flows, P2 booking/refund, P3 homework or documented gap.

TL;DR: The repo has no browser-test runner, no e2e directory, and no CI, so "the existing Playwright audit flow" does not exist as an artifact — the Step C evidence was throwaway scripts in `%TEMP%`. D1 builds a real suite: `@playwright/test` in the frontend workspace, specs under `frontend/e2e`, API-mode and demo-mode runs on separate ports, self-contained fixtures, and a root `npm run e2e`. CI wiring is deferred with a backlog note because the repo has no remote pipeline to add to.

## Overview

Umbrella Step D item 1 asks to run the audit flow against the API-backed build and add login, booking, cancellation/refund, homework, upload, and notification cases to CI. Two of those three clauses need reinterpretation against the actual repo:

- There is no committed Playwright flow; the four Step C scripts live in `C:\Users\mckin\AppData\Local\Temp\opencode\` and are not portable.
- There is no CI configuration at all (`.github/` exists only inside `node_modules`), and no Playwright or Vitest dependency in the frontend workspace.

D1 therefore delivers the durable, runnable half: a suite that covers the six flows in API mode plus a demo-mode regression, invoked by one command, shaped so a CI job only has to call it. The suite is the safety net for D2 (import) and D3 (fallback removal).

## Goals

- One command (`npm run e2e`) runs the API-mode suite and the demo-mode regression and exits non-zero on any failure.
- Login, upload, notification, booking, cancellation/refund, and homework are each covered by at least one spec, or explicitly recorded as a gap with the reason.
- Every spec is repeatable: two consecutive runs on the same seeded database both pass without manual cleanup.
- Failures produce artifacts (trace, screenshot, video on first retry) that can be inspected offline.
- No production behavior change; the only app edits allowed are `data-testid` attributes where no stable selector exists.

## Scope

**In scope**

- `frontend/e2e/` harness: config for API mode, config for demo mode, env/port launcher, shared helpers, fixtures.
- Specs: auth/login, uploads (plan file + cancellation evidence), notifications (feed, read, mute), booking, cancellation/refund, homework (or documented gap).
- `@playwright/test` devDependency pinned to 1.65.1 (matches the already-cached `chromium-1255` browser build).
- npm scripts at frontend and root level; `.gitignore` entries for run artifacts.
- Docs: `frontend/PROGRESS.md` verification commands, `process/context/tests/all-tests.md`, `process/context/all-context.md` (testing gates row), `frontend/CUTOVER_PROGRESS.md` board, and a backlog note for CI.

**Out of scope**

- GitHub Actions / any CI pipeline (no remote exists). Recorded as a backlog note; the suite must only need `npm ci`, `db:seed`, `npm run e2e`.
- The one-time import (D2) and fallback removal (D3).
- Backend rule changes. Any rule bug found by the suite is reported, not silently fixed.
- Load, accessibility, and visual-regression testing.

## Decisions

- **D1 Runner.** `@playwright/test@1.65.1` in the `frontend` workspace. Browsers are already cached (`%LOCALAPPDATA%\ms-playwright\chromium-1255`), so install should not download. The previous zero-dependency scripts stay out of the repo.
- **D2 Two runs, not two projects.** `NEXT_PUBLIC_DEMO_MODE` / `NEXT_PUBLIC_DATA_SOURCE` are inlined at dev-server start, and Next 16 permits one dev server per project folder. API mode runs on port 3000, demo mode on 3100, sequentially, each with its own config.
- **D3 Env without shell syntax.** npm scripts run under cmd.exe on Windows, so `VAR=value next dev` is not portable. A tiny `e2e/serve.mjs` sets `process.env` and spawns `next dev -p <port>`; Playwright's `webServer` invokes it. No `cross-env` dependency.
- **D4 Backend is reused when already up.** `webServer` starts the backend on 4000 only if nothing answers `/health`; `reuseExistingServer` is on outside CI. The suite never migrates, resets, or seeds — preconditions are checked and reported.
- **D5 Selectors.** The app has zero `data-testid` attributes; Step C proved class/text/role selectors for uploads, evidence, and the bell. New flows prefer roles and labels; `data-testid` is added only where two elements are genuinely indistinguishable, capped at five additions, each listed in the report.
- **D6 Fixtures are self-contained.** Seeded `.school` accounts only. Unique `runId` per run for file names and cancellation comments. Cancellation/refund creates its own lesson through the manager "book on behalf" flow instead of consuming shared pending requests. Mute state is restored in `afterAll`.
- **D7 Preconditions are checked, never repaired.** Specs assume local Postgres reachable, migrations applied, and `db:seed` run at least once; a missing precondition fails with an instruction, not a repair action.
- **D8 Phasing.** P1 harness + auth + uploads + notifications uses the flows Step C already proved. P2 adds booking and cancellation/refund (needs slot and credit assertions). P3 adds homework only if a non-destructive path exists.

## Architecture Notes

```
frontend/
  playwright.config.ts          API mode: port 3000, NEXT_PUBLIC_DEMO_MODE=false, DATA_SOURCE=api
  playwright.demo.config.ts     Demo mode: port 3100, demo defaults, no backend requirement
  e2e/
    serve.mjs                   sets per-mode env + port, spawns next dev
    support/auth.ts             login(page, email), apiLogin(), logout()
    support/api.ts              typed fetch helpers for state assertions (credits, notifications)
    support/fixtures.ts         runId, PDF/PNG buffers, download capture
    support/preconditions.ts    /health, /school/bootstrap, seeded accounts
    api/*.spec.ts               auth, uploads, notifications, booking, cancellation-refund, homework
    demo/*.spec.ts              demo regression (login, booking, uploads, bell)
```

- **API mode** asserts through both surfaces: UI behavior plus API state (credit delta, `read_ids`, attachment bytes) so a UI-only lie cannot pass.
- **Demo mode** asserts the browser store path: IndexedDB upload/download, localStorage read/mute, any-password login.
- **Download assertions** compare byte length and content against the uploaded buffer, not just the suggested filename.
- **Ordering**: specs are independent; `workers: 1` because they share one database and one dev server. Artifacts go to `frontend/test-results/` and `frontend/playwright-report/` (gitignored).

## Touchpoints

New: `frontend/playwright.config.ts`, `frontend/playwright.demo.config.ts`, `frontend/e2e/**`.
Modified: `frontend/package.json` (dependency + scripts), `package-lock.json`, root `package.json` (`e2e`), `.gitignore`, `frontend/PROGRESS.md`, `process/context/tests/all-tests.md`, `frontend/CUTOVER_PROGRESS.md`.
Possibly modified (testids only, capped): `frontend/app/components/{student/StudentLessons.tsx,teacher/TeacherLessons.tsx,manager/ManagerApprovals.tsx}`.

## Public Contracts

What D1 promises to the rest of the repo:

| Contract | Shape | Consumers |
|---|---|---|
| Root command | `npm run e2e` → API suite then demo suite, non-zero on any failure | closeout evidence for D2/D3, CI later |
| Workspace commands | `npm run e2e:api`, `npm run e2e:demo` inside `frontend` | local debugging of one mode |
| Preconditions | seeded local Postgres, `backend/.env`, ports 3000/3100/4000 | developer machines, future CI job |
| Env contract | per-mode env injected by `e2e/serve.mjs` only; `.env*` files untouched | all runs |
| Artifacts | `frontend/test-results/`, `frontend/playwright-report/` (gitignored) | failure triage |
| Non-contract | suite never migrates, seeds, resets, or repairs the database | safety review |

## Blast Radius

- **Build/supply chain**: one new devDependency plus lockfile churn; no runtime dependency added.
- **App runtime**: none intended. Any testid edit is attribute-only and covered by `typecheck` + `lint` + a re-run of the suite.
- **Database**: specs create real rows (lesson, cancellation request, uploaded attachment, notification read ids). No updates or deletes to seeded demo records other than the notification state of the acting user, which is restored.
- **Developer workflow**: new root `npm run e2e` becomes part of the closeout evidence for every later step.

## Implementation Checklist

### P1 Harness and proven flows
- [x] P1.1 Add `@playwright/test@1.65.1` to `frontend` devDependencies; confirm no browser download is triggered.
- [x] P1.2 `e2e/serve.mjs` (env + port + `next dev`), `playwright.config.ts` with `webServer` for backend and frontend, `workers: 1`, retries 1 under `CI`, trace/screenshot/video on failure.
- [x] P1.3 Support modules: `preconditions.ts` (health, seed check), `auth.ts` (API + demo login, logout), `fixtures.ts` (runId, PDF/PNG buffers, download capture), `api.ts` (credit balance, notification state).
- [x] P1.4 `api/auth.spec.ts`: backend login 200 + bootstrap 200, no token in localStorage/cookie, wrong password surfaces an error, logout clears the session.
- [x] P1.5 `api/uploads.spec.ts`: admin uploads a PDF to a plan, row appears, download is byte-identical; cancellation evidence upload path covered in P2.
- [x] P1.6 `api/notifications.spec.ts`: bell merges the feed, mark-all-read persists after reload, mute persists after reload, both restored in `finally` (per test, so a mid-test failure still restores).
- [x] P1.7 Scripts: `frontend` `e2e:api`, `e2e:demo`, `e2e`; root `e2e`; `.gitignore` for `test-results/` and `playwright-report/`.
- [x] P1.8 `demo/regression.spec.ts` on port 3100: any-password login, local snapshot present, IndexedDB upload + download, bell read state survives reload.
- [x] P1.9 Green run: `npm run e2e` twice consecutively.

### P2 Booking and cancellation/refund
- [x] P2.1 `api/booking.spec.ts`: teacher opens a fresh future slot (or uses a seeded open slot if the UI cannot create one), student books it, credit delta is exactly -1, lesson appears in Upcoming.
- [x] P2.2 `api/cancellation-refund.spec.ts`: manager books on behalf for the runId, teacher requests cancellation with a PNG, manager sees the evidence (blob URL in API mode), approves, student credit delta is exactly +1, lesson reads cancelled.
- [x] P2.3 Handle the shared-data risk explicitly: if a self-contained lesson cannot be created, stop and report instead of approving another run's request.

### P3 Homework
- [x] P3.1 Determine whether a non-destructive homework path exists (teacher creates an assignment, or a self-created lesson can carry one).
- [x] P3.2 If yes: `api/homework.spec.ts` submits as student and reviews as teacher. If no: record the gap in the report and `process/context/tests/all-tests.md`, and keep homework coverage at the API-smoke level.

### Verification and docs
- [x] V1 `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend`.
- [x] V2 `npm run e2e` (both modes) twice; capture timings and artifact paths.
- [x] V3 Demo-mode source untouched: `git diff --stat` shows no `frontend/app/lib/**` changes except allowed testids.
- [x] V4 Docs: `frontend/PROGRESS.md` verification commands, `process/context/tests/all-tests.md` (suite, commands, last green), `frontend/CUTOVER_PROGRESS.md` (D1 row + verification rows), backlog note for CI wiring.
- [x] V5 Report with per-spec coverage table and any documented gaps.

## Acceptance Criteria (umbrella mapping)

| Umbrella item | Proving gate |
|---|---|
| Run the audit flow against the API-backed build | `npm run e2e` API mode green, twice |
| Add login, upload, notification cases | `api/auth.spec.ts`, `api/uploads.spec.ts`, `api/notifications.spec.ts` |
| Add booking and cancellation/refund cases | `api/booking.spec.ts`, `api/cancellation-refund.spec.ts` with credit deltas |
| Add homework case | `api/homework.spec.ts` or a documented gap with reason |
| Demo/local mode unchanged | `demo/regression.spec.ts` green + no `frontend/app/lib/**` diff |
| "to CI" | Deferred: backlog note stating the exact CI job needed (`npm ci`, Postgres service, `db:migrate`, `db:seed`, `npm run e2e`) |

## Validate Contract

| Contract item | Command / probe | Pass condition |
|---|---|---|
| C1 Suite runs end to end | `npm run e2e` (root) on a seeded DB | exit 0; API and demo modes both reported |
| C2 Repeatable | run C1 twice back to back | both exit 0, no manual cleanup between runs |
| C3 Failure artifacts | force one failing expectation locally, then revert | trace/screenshot/video written under `frontend/test-results/`, exit non-zero |
| C4 No destructive DB work | grep gate over `frontend/e2e/**` | no `reset`, `truncate`, `push`, `db:reset` |
| C5 No behavior change | `git diff --stat` + selective review | app changes limited to `data-testid` attributes |
| C6 Repo gates stay green | `npm run typecheck`, `npm run lint`, backend tests | all exit 0 |
| C7 Docs reflect reality | read the four docs listed in V4 | commands, counts, and the CI gap match the repo |
| C8 Preconditions fail loudly | stop Postgres or use a fresh empty DB | suite fails with an actionable message, does not repair or seed |

## Verification Evidence

| Gate | Strategy | Command |
|---|---|---|
| Static | Fully-Automated | `npm run typecheck`, `npm run lint` |
| Backend regression | Fully-Automated | `npm run test --workspace @lumina/backend` |
| Browser API | Hybrid | `npm run e2e` (API config) |
| Browser demo | Hybrid | `npm run e2e` (demo config) |
| Determinism | Hybrid | two consecutive full runs |
| Failure artifacts | Fully-Automated | deliberate red run + artifact check |
| Safety | Agent-Probe | grep gate + diff review |
| Docs | Agent-Probe | V4 checklist |

## Dependencies and Sequencing

P1 must be green before P2 starts (harness and helpers are shared). P2 before P3. Docs last, after the counts are real. `@playwright/test` install happens once, at P1.1, before any config is written.

## Risks

- **Selector fragility.** The app has no testids and uses text-heavy UI. Mitigation: reuse Step C's proven selectors; add at most five testids where unavoidable; assert on API state, not only on text.
- **Shared dev database.** Specs create rows that persist (uploads, lessons, requests). Mitigation: unique runId markers, self-contained refund lesson, no approvals of pre-existing pending requests, documented residue.
- **Next 16 dev-server constraint.** One server per folder means API and demo runs cannot overlap. Mitigation: separate ports plus sequential script; `workers: 1`.
- **Inlined env.** `NEXT_PUBLIC_*` cannot be changed at runtime; a single "smart" config that flips modes per project will silently test the wrong mode. Mitigation: two configs, two servers, an explicit assertion in each spec that the mode is the expected one.
- **No CI.** The umbrella item cannot be fully satisfied. Mitigation: CI-shaped scripts + a backlog note with the exact job definition; record the deviation in the report.
- **Runtime cost.** Six flows across three roles plus a demo pass will take minutes. Mitigation: keep each spec narrow, reuse one login per role via `storageState` where cookies suffice, avoid artificial waits in favor of web-first assertions.

## Phase Completion Rules

- A phase is NOT complete while any checklist box is open or any Validate Contract row is red.
- P1 is NOT complete until `npm run e2e` passes twice consecutively in both modes.
- No phase completion without the demo-mode regression green (C1) — the suite must prove local mode was not broken.
- Any spec change after the last green run re-opens C1 and C2.
- A discovered product bug is reported in the plan/report and does not get fixed inside D1 without explicit approval; the spec may be marked `test.fixme` with the reason.
- Docs and the backlog note are part of the phase, not follow-up work.

## Resume and Execution Handoff

Status: EXECUTE complete 18-11-26. Suite lives in `frontend/e2e/`; report in
`d1-parity-suite_REPORT_18-11-26.md`. Nothing is archived yet.

- Re-run: `npm run e2e` (needs local Postgres, `backend/.env`, a seeded DB, ports 3000/3100/4000 free).
- Commands that must stay green: `npm run typecheck`; `npm run lint`; `npm run test --workspace @lumina/backend`; `git diff --check`; `npm run e2e`.
- Do not edit `.env.local` or `backend/.env`; per-mode env is injected by `e2e/serve.mjs`.
- `process/context/**` was updated in the same session (all-context, tests) because the plan's V4 and the
  user's request required it; UPDATE PROCESS should verify, not redo.
- Next Step: UPDATE PROCESS (archive this folder, refresh context, close the cutover board row), then D2/D3 plans.
