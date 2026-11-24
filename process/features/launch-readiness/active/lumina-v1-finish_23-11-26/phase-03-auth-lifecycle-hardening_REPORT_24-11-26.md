---
phase: phase-03-auth-lifecycle-hardening
date: 2026-11-24
status: COMPLETE_WITH_GAPS
feature: launch-readiness
plan: process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-03-auth-lifecycle-hardening_PLAN_23-11-26.md
---

# Phase 03 — Auth & Account Lifecycle Hardening Report (EXECUTE)

**Bottom line:** Steps A–C are implemented and every gate the executor ran is green (typecheck,
lint, 43 backend tests, smoke 15/15 domains / 463 checks, e2e 26 API + 3 demo, no migration).
"With gaps" means: the agent-probe UI check (P3-13) was not run, and the review decision is
`approved-with-concerns` (6 non-blocking findings plus 4 planned known gaps, all in backlog).
**Update 24-11-26 (UPDATE PROCESS):** the independent EVL re-run (vc-tester) is green and the user
recorded the review decision; the phase is closed (see the sections below).

## What Was Done

- **A0 shared policy** (`backend/src/lib/password.ts`): `PASSWORD_MIN_LENGTH = 10`,
  `passwordSchema` (10–128, length only), `changePasswordSchema` (rejects new == current),
  `resetPasswordSchema` (`.strict()`, `newPassword` only). Used by `/auth/register`, `POST /users`,
  change-password and reset.
- **A3 helper** (new `backend/src/lib/refresh-tokens.ts`): `refreshCookieOptions(env)` (pure),
  `revokeUserRefreshTokens(db, userId)`, `pruneRefreshTokens(db, { userId?, now? })`,
  `REVOKED_TOKEN_RETENTION_DAYS = 7`, cookie name/path constants.
- **A1 `POST /auth/change-password`**: authenticate → caller active → verify current
  (`400 INVALID_CURRENT_PASSWORD`, never 401) → one transaction (hash update + revoke all tokens) →
  `issueSession` after commit (rotated cookie) → `user.password_changed` activity → `{ success: true }`.
- **A2 `POST /users/:id/reset-password`** (admin): self-reset 400, unknown 404, one transaction
  (update + revoke), `user.password_reset` activity, returns `{ id, success: true }`.
  `PATCH /users/:id` revokes tokens when status moves away from `active`; `DELETE /users/:id` revokes.
- **A4** `changePassword()` in `frontend/app/lib/api/auth.ts`; new
  `frontend/app/components/shared/PasswordChangeCard.tsx` (current/new/confirm, inline error,
  `onNotice`), mounted above `ACCOUNT ACCESS` in Manager (admin + manager), Teacher, Student
  Settings. Demo mode renders a static "Demo mode — passwords are not enforced" card; the form and
  its API call never mount.
- **A5** `ResetPasswordModal` in `PeopleForms.tsx` (copy: "lose access within 15 minutes");
  `reset-password` dialog in `ManagerTeachers`, `ManagerStudents` (detail footers, admin +
  `!isDemoMode()`), `AdminManagers` (card footer, `!isDemoMode()`); `resetPersonPassword` service
  (local branch → `fail(...)`) → `resetUserPassword` API call; `user.password_changed` /
  `user.password_reset` added to the backend `ActivityAction` union and the frontend `ACTION_TITLES`.
- **B1 limits** (`auth.ts`): route-level `config.rateLimit` on login / refresh / change-password
  (`max: AUTH_RATE_LIMIT_MAX`, `hook: "preHandler"`, total hashed key generators:
  ip+email, ip+cookie prefix, ip+user.sub). Per-IP ceiling (`RATE_LIMIT_MAX`/min) via one
  `app.createRateLimit` run first in each route's `preHandler`, throwing a 429 `AppError`.
  `AUTH_RATE_LIMIT_MAX` added to env (default 30), to the literal `Env` objects in `app.test.ts` /
  `contract.test.ts`, to smoke's `loadEnv` map and Playwright's backend env (`100000`).
- **B2 prune**: per-user prune awaited in try/catch on login and refresh; hourly global sweep on
  login, fire-and-forget with a caught/logged error.
- **B3** `envSchema.superRefine` rejects empty, `*`, or non-http(s) `CORS_ORIGIN` in production;
  `issueSession` uses `refreshCookieOptions`.
- **B4** `/auth/refresh` still rejects inactive users (commented as the primary gate; revocation is
  defense in depth).
- **C1 tests**: `password.test.ts` (+3 policy tests), `db-types.test.ts` (+2 env tests),
  `contract.test.ts` (+1 route-contract test), new `auth-lifecycle.test.ts` (6 tests: cookie options,
  key generators, 429 trip, per-email buckets, per-IP ceiling, change-password by `user.sub`, refresh).
- **C2 smoke** `auth` domain (58 checks) on dedicated fixture `smoke-{runId}-pwuser@smoke.lumina.test`.
- **C3 e2e**: two new tests in `frontend/e2e/api/auth.spec.ts` on a disposable manager (created via
  admin `POST /users`, archived in `finally`); demo explainer assertions in
  `frontend/e2e/demo/regression.spec.ts`; `createDisposableUser` / `archiveUser` helpers in
  `frontend/e2e/support/api.ts`.
- **High-risk pack**: `harness/phase-03-auth/` (5 artifacts).

## E5 — refresh_tokens sweep on dev `lumina`

| When | Total rows | Expired | Revoked > 7 days | Matching retention rule |
|---|---|---|---|---|
| Before first smoke (2026-11-24T01:41:50Z) | 1090 | 0 | 0 | **0** |
| After 2 smoke runs + e2e (01:46:11Z) | 1166 | 0 | 0 | 0 |

The global sweep had nothing to delete on dev. The only rows deleted were the fabricated
expired/old-revoked rows on the smoke fixture user (by design), and the remaining fabricated rows
were removed in `finally`. No other deletes, no reset/push/TRUNCATE.

## What Was Skipped or Deferred

- **P3-13 agent-probe** (vc-agent-browser visual check of the card and modal at 390px): not run by
  the executor or EVL. Copy is asserted by e2e ("within 15 minutes", demo explainer text). Closed as known gap P3-13.
- **Reviewer decision**: `pending-review` at execute time by design; recorded
  `approved-with-concerns` on 24-11-26 (see Review Decision).
- Backlog notes and context-doc updates: done in UPDATE PROCESS 24-11-26.

## EVL Confirmation (independent vc-tester run, 24-11-26)

All green: `npm run typecheck`, `npm run lint`, backend vitest (6 files / 43 tests),
`git diff --check`, `git status --porcelain -- backend/src/db` (empty), `npm run smoke` (15/15
domains, 463 checks, auth 58), `npm run e2e` (26 API + 3 demo, no 429), seeded admin login 200.
`results.tsv`: row 0 baseline, row 1 `HALTED_SUCCESS`. Known gap: P3-13 visual agent-probe not run.

## Review Decision

`approved-with-concerns` (user decision on an independent vc-code-reviewer static review, 24-11-26;
user option A: no fixes now, all concerns to backlog). Recorded in
`harness/phase-03-auth/review-decision.json`; `validate-risk-artifacts.mjs` reports 0 failures.
No blocking findings. Non-blocking findings:

| ID | Finding | Backlog note |
|---|---|---|
| M1 | Fixed default password for every admin-created account, no forced change (pre-existing; HIGH, should-fix before launch / Phase 06) | `default-account-password_NOTE_24-11-26.md` |
| M2 | Admin can reset another admin with no step-up | `admin-password-recovery_NOTE_24-11-26.md` |
| L3 | `/auth/refresh` claim not atomic | `refresh-and-password-change-atomicity_NOTE_24-11-26.md` |
| L4 | change-password session and activity outside the transaction | same note |
| L5 | No production cap on limiter env; guards depend on `NODE_ENV=production` | `auth-rate-limit-config_NOTE_24-11-26.md` |
| L6 | Cookieless refresh shared per-IP bucket; ceiling 429 lacks `Retry-After` | same note |

## Backlog Notes Written (7, `process/features/launch-readiness/backlog/`)

`access-token-revocation`, `trust-proxy-and-limiter-store`, `admin-password-recovery`,
`refresh-token-expiry-index`, `default-account-password`, `refresh-and-password-change-atomicity`,
`auth-rate-limit-config` (all `_NOTE_24-11-26.md`; the L3+L4 and L5+L6
pairs share a note each, and M2 lives in `admin-password-recovery`). Phase 06 gets a "Carried in from
Phase 03" pointer list.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| P3-6 | `npm run typecheck` | PASS (exit 0) |
| P3-6 | `npm run lint` | PASS (exit 0) |
| P3-1..5 | `npm run test --workspace @lumina/backend` | PASS — 6 files, 43 tests (was 5 / 31) |
| P3-6 | `git diff --check` | PASS (exit 0) |
| P3-6 | `git status --porcelain -- backend/src/db` | PASS (empty) |
| P3-7..9, P3-12 | `npm run smoke` | PASS — 15/15 domains, 463 checks (auth 58, uploads 38, credits 68); green on both runs |
| P3-10..12 | `npm run e2e` | PASS — 26 API (24 + 2 new) + 3 demo; no 429 |
| P3-13 | vc-agent-browser | NOT RUN (see above) |
| Pack | `validate-risk-artifacts.mjs …/harness/phase-03-auth` | executor run: 1 expected failure (decision pending); after the 24-11-26 review decision: 0 failures |
| Plan | `validate-phase-stub.mjs <plan>` | 0 failures |
| EVL | independent vc-tester re-run of every gate above | all green (see EVL Confirmation) |

Red-first note: the Fully-Automated stubs were written with the implementation in one pass and went
green on the first run; the limiter test's exact 429 trip points (4th request, 5th/6th rotating
emails) show it is not vacuous.

## Plan Deviations

All within blast radius; none is hard-stop class.

1. `pruneRefreshTokens(db, now?)` → `pruneRefreshTokens(db, { userId?, now? })`: one function serves
   both the per-user prune and the global sweep. Naming/signature only.
2. `refreshCookieOptions` takes `Pick<Env, "NODE_ENV" | "REFRESH_TOKEN_TTL_DAYS">` instead of the full
   `Env`, so tests pass only the two fields.
3. Extra hardening inside the contract: `resetPasswordSchema` is `.strict()` (mass-assignment
   scenario), and the production CORS guard also rejects non-http(s) origins (E4 allowed this).
4. `frontend/e2e/support/api.ts` gained `createDisposableUser` / `archiveUser` (file was in blast
   radius as "optional helper").
5. e2e uses a disposable **manager** for both tests (allowed by C3/E6); the admin reset is exercised
   from the `AdminManagers` card, not a teacher/student detail modal. Teacher/student reset buttons
   are type-checked and smoke covers the API, but not browser-tested.
6. Report filename uses `_REPORT_24-11-26.md` (orchestrator instruction) rather than the plan
   header's `_REPORT_23-11-26.md`.
7. `ResetPasswordModal` copy keeps the 15-minute wording but is phrased as "Devices where they are
   already signed in lose access within 15 minutes".
8. Executor tooling note: an earlier script briefly wrote the em dash in the self-reset message as
   cp1252; fixed to UTF-8 and smoke re-run green afterwards.

## Test Infra Gaps Found

- Agent-probe P3-13 not executed (no browser tooling available; the user did not request a manual
  check). Known gap; the copy is asserted by e2e only.
- Teacher/student `Reset password` buttons have no browser test (manager card path only).
- Limiter behavior under the real default (30/min) is proven by vitest only; smoke and e2e run with
  the 100000 override by design.

## SPEC Achievement

The inner loop is governed by the umbrella SPEC (no per-phase SPEC). Phase acceptance criteria are
the plan's P3-1..P3-13 gates:

- **Met (automated or hybrid gate passed, twice: executor and independent EVL):** P3-1..P3-12
  (password policy, change/reset routes and revocation, limiter keying and ceiling, prune, CORS
  guard, cookie options, demo fence, no 429 in smoke/e2e, regression suite).
- **Unmet (residual, not a developed-behavior gate):** P3-13 visual agent-probe at 390px. Only
  coverage is e2e copy assertions. Backlog stub: re-run the probe when browser tooling is available
  (tracked in this report and the plan Known Gaps; no separate note needed).

## SPEC Gaps

P3-13 (above). Access-token revocation, proxy trust, admin recovery, and the expiry index are
declared known gaps with backlog notes; they are outside the phase acceptance criteria.

## Closeout Packet

1. Selected plan: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-03-auth-lifecycle-hardening_PLAN_23-11-26.md`
2. Classification: **Ready for UPDATE PROCESS archival** at the phase level (phase VERIFIED with
   gaps); the program folder stays in `active/` because Phases 04-06 remain.
3. Finished: checklist A0–A5, B1–B4, C1–C3; Phase Loop steps 1-7 ticked.
4. Verified: all automated and hybrid gates, executor run plus independent EVL. Unverified: P3-13
   visual probe; real-default (30/min) limiter behavior only under vitest.
4b. Validate-contract: present inline in the plan, Gate: PASS (24-11-26); review decision
   approved-with-concerns.
5. Cleanup done: report, plan, umbrella state, registry, risk pack, 7 backlog notes, auth/tests/root
   context. Still needed: commits (offered by the orchestrator).
6. Next valid state: Phase 04 Curriculum Library, Step 1 RESEARCH.
7. Commit checkpoint: execution commit first (code, tests, e2e, smoke), then process commit.
8. Regression status: Phase 02 upload scoping and staff-managed credits proved green by the same
   smoke/e2e run (uploads 38, credits 68 checks; e2e uploads spec).
9. SPEC achievement: see above (P3-1..12 met, P3-13 unmet).

Drift score: HIGH (4 signals: more than 10 files touched; process/ folder structural change with
7 new backlog notes; 3+ memory-worthy findings; validate-contract deviations 1-8). No harness or
protocol files touched.

Follow-up plan stubs created: 7 backlog notes (see above), no code stubs.
CONTEXT_PARTIAL: none.

## Forward Preview

### Test Infra Found
- Backend vitest: 6 files / 43 tests. Smoke: 15 domains / 463 checks (`auth` added last).
- e2e: 26 API + 3 demo tests. Disposable-account helpers now exist in `frontend/e2e/support/api.ts`.

### Blast Radius Changes
- New files: `backend/src/lib/refresh-tokens.ts`, `backend/tests/auth-lifecycle.test.ts`,
  `frontend/app/components/shared/PasswordChangeCard.tsx`.
- `frontend/playwright.config.ts` (Phase 06 shared surface): one-line env addition.
- `backend/src/app.ts` and `backend/src/plugins/auth.ts`: unchanged (verify-only).

### Commands to Stay Green
`npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend`, `npm run smoke`,
`npm run e2e`, `git diff --check`, `git status --porcelain -- backend/src/db`. Any new env consumer
must keep `AUTH_RATE_LIMIT_MAX: "100000"` in smoke and Playwright.

### Dependency Changes
None (no new packages; `@fastify/rate-limit` 10.3.0 `createRateLimit` used as installed).
