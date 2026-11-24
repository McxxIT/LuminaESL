---
name: plan:lumina-v1-finish-phase-03-auth-lifecycle-hardening
description: "Lumina ESL v1 Finish — Phase 03: Password change/reset, per-route auth rate limits, refresh-token cleanup, and cookie/CORS hardening"
date: 23-11-26
metadata:
  node_type: memory
  type: plan
  feature: launch-readiness
  phase: phase-03
---

# Phase 03 — Auth & Account Lifecycle Hardening

**Program:** lumina-v1-finish
**Umbrella plan:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md
**Phase status:** ✅ VERIFIED (with gaps) — EVL green 24-11-26; review decision `approved-with-concerns` (user, 24-11-26); known gap P3-13 (visual agent-probe not run)
**Report destination:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-03-auth-lifecycle-hardening_REPORT_24-11-26.md (flat in the program task folder)

---

## Purpose

Harden the authentication and account lifecycle for production readiness without requiring an external paid email service:
1. Add self-service password change (`POST /auth/change-password`, requires current password, revokes other refresh tokens) and admin-issued password reset (`POST /users/:id/reset-password`, admin-only, revokes target user's refresh tokens, logs `user.password_reset` activity).
2. Add stricter per-route rate limits on `/auth/login` and `/auth/refresh` (bypassable/configurable in test env via `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` so smoke/e2e stay fast).
3. Add expired/revoked refresh-token cleanup (on login/refresh and a clean helper) and verify production cookie flags (`secure`, `sameSite`, `httpOnly`) + strict per-environment `CORS_ORIGIN` validation.

---

## Entry Gate

- Phase 02 complete (upload scoping and staff-managed credits verified and committed)

---

## Blast Radius

Backend:

- `backend/src/routes/auth.ts` — change-password route, per-route limits, prune hooks
- `backend/src/routes/users.ts` — reset-password route, revocation on pause/archive, shared policy
- `backend/src/lib/password.ts` — shared `passwordSchema` / `PASSWORD_MIN_LENGTH`
- `backend/src/lib/refresh-tokens.ts` — **new** `revokeUserRefreshTokens` + `pruneRefreshTokens`
- `backend/src/lib/activity.ts` — `user.password_changed` / `user.password_reset`
- `backend/src/plugins/auth.ts` — verify-only (no expected change; confirm 400 vs 401 handling)
- `backend/src/config/env.ts` — `AUTH_RATE_LIMIT_MAX`, production CORS guard
- `backend/src/app.ts` — pass auth limit config if route-level config is insufficient
- `backend/tests/{app,contract,password,db-types}.test.ts` (literal `Env` objects exist only in `app.test.ts` and `contract.test.ts`; `db-types.test.ts` uses `envSchema.parse`) plus optional new `backend/tests/auth-lifecycle.test.ts` for the limiter and cookie-option tests
- `backend/scripts/smoke.ts` — auth limit override + new `auth` domain (lifecycle/prune scenarios on a dedicated fixture user)

Frontend:

- `frontend/app/lib/api/auth.ts` — `changePassword()`
- `frontend/app/components/shared/PasswordChangeCard.tsx` — **new** shared card
- `frontend/app/components/{manager,teacher,student}/*Settings.tsx` — mount the card, demo explainer
- `frontend/app/components/manager/PeopleForms.tsx` — `ResetPasswordModal`
- `frontend/app/components/manager/ManagerTeachers.tsx`, `ManagerStudents.tsx`, `frontend/app/components/admin/AdminManagers.tsx` — reset action in detail footers
- `frontend/app/lib/school/services/people.ts`, `frontend/app/lib/school/api/school.ts` — `resetPersonPassword` / `resetUserPassword`
- `frontend/app/lib/school/notifications.ts` — activity titles

Test harness:

- `frontend/e2e/api/auth.spec.ts`
- `frontend/e2e/demo/regression.spec.ts` — demo explainer-card assertion (the API config does not run the demo specs)
- `frontend/e2e/support/api.ts` — optional helper for admin reset/restore calls
- `frontend/playwright.config.ts` — `AUTH_RATE_LIMIT_MAX` in backend webServer env

---

## Implementation Checklist

### Step A — Password Change & Admin Reset (API + UI)

- [x] A0. Shared policy: export `passwordSchema` + `PASSWORD_MIN_LENGTH` from `backend/src/lib/password.ts` — length-only `min(10).max(128)`, no composition rules (Decision 2). Apply to `/auth/register`, `POST /users`, A1, A2.
- [x] A1. `POST /auth/change-password` (authenticated): load caller and require `status === "active"`; verify `currentPassword`; mismatch → `400` with `code: "INVALID_CURRENT_PASSWORD"` (never 401, Decision 1; throw `new AppError(400, "INVALID_CURRENT_PASSWORD", ...)` because the `badRequest` helper hard-codes `BAD_REQUEST`); reject `newPassword === currentPassword`; in ONE `app.db.transaction` hash + update the password and `revokeUserRefreshTokens(tx, userId)`; after commit `issueSession(app, reply, user)` to set a fresh cookie; log `user.password_changed`; return `{ success: true }` (do not return the access token).
- [x] A2. `POST /users/:id/reset-password` (admin): validate `newPassword` with the shared policy (no current password); if `request.user.sub === id` → `400` "You cannot reset your own password — use the change-password flow" (Decision 3); `404` unknown user; in ONE transaction hash + update and revoke **all** target refresh tokens; log `user.password_reset` (summary = target name); return `{ id, success: true }` (never echo the password).
- [x] A3. `backend/src/lib/refresh-tokens.ts`: `revokeUserRefreshTokens(db, userId)` and `pruneRefreshTokens(db, now?)`; wire revocation into `PATCH /users/:id` when status transitions away from `active` and into `DELETE /users/:id` (Decision 3/4). Implement before A1/A2 so both routes share the helper.
- [x] A4. Frontend self-service: `changePassword()` in `frontend/app/lib/api/auth.ts`; new `frontend/app/components/shared/PasswordChangeCard.tsx` (current/new/confirm, inline error, success notice via `onNotice`); mount in Manager/Teacher/Student Settings under `ACCOUNT ACCESS` only when `!isDemoMode()`; in demo mode render a static "Demo mode — passwords are not enforced" card (Decision 5). No API call in demo mode.
- [x] A5. Frontend admin reset: `ResetPasswordModal` in `PeopleForms.tsx` (new + confirm; copy must say other sessions end within the access-token lifetime of up to 15 minutes, NOT "signs them out everywhere" because the access JWT is stateless); `dialog.kind === "reset-password"` in `ManagerTeachers`, `ManagerStudents`, `AdminManagers` detail-modal footers, admin + `!isDemoMode()` only; `resetPersonPassword(actorId, userId, newPassword)` in `services/people.ts` → `resetUserPassword()` in `lib/school/api/school.ts`; local branch returns a clear `fail(...)` (unreachable via UI) (Decision 6); add `user.password_reset` / `user.password_changed` to the backend `ActivityAction` union (`backend/src/lib/activity.ts`) and to the frontend `ACTION_TITLES` map in `notifications.ts` (no frontend `ActivityAction` union exists).

### Step B — Rate Limits, Token Hygiene & Prod Cookie/CORS Config

- [x] B1. Per-route auth limits via route-level `config.rateLimit` (`@fastify/rate-limit` 10.3.0), `max: AUTH_RATE_LIMIT_MAX` (default `30`/min), **`hook: "preHandler"`** (the default `onRequest` hook runs before body parsing and JWT verification, so a body- or `request.user`-based key would be empty) and a total, never-throwing `keyGenerator` (type-check input, lowercase/trim, cap length, hash user-controlled parts): `/auth/login` keyed by `ip + normalized email`, `/auth/change-password` keyed by `ip + user.sub` (the limiter is appended after `app.authenticate` in the preHandler array), `/auth/refresh` keyed by `ip + sha256(cookie) prefix`. **A route-level `config.rateLimit` REPLACES the global limiter on that route**, so also keep a coarse per-IP ceiling (`RATE_LIMIT_MAX`, 1 minute) on the three routes: create it once with `app.createRateLimit(...)`, run it first in the route `preHandler`, and throw a 429 `AppError` when `isExceeded`. Do NOT add it as a second route-level limiter: v10's per-request `rateLimitRan` flag makes a second route limiter a silent no-op. Add the env var and update the literal `Env` objects in `app.test.ts` and `contract.test.ts` (`db-types.test.ts` has no literal), plus `backend/scripts/smoke.ts` (`loadEnv` map) and `frontend/playwright.config.ts` (backend webServer env) with `AUTH_RATE_LIMIT_MAX: "100000"`.
- [x] B2. Wire `pruneRefreshTokens` into `/login` (per-user prune + global sweep throttled to ≤1/hour via module-level timestamp) and `/refresh` (per-user only). Retention: delete expired rows and revoked rows older than `REVOKED_TOKEN_RETENTION_DAYS = 7`. **No migration, no new index** (Decision 4). Pruning is best-effort: the per-user prune is awaited inside try/catch (a prune failure must never fail a login or refresh); the global sweep is fire-and-forget with a caught and logged error so a closing app or DB never produces an unhandled rejection.
- [x] B3. Production config guard: `envSchema.superRefine` rejects empty/`*` `CORS_ORIGIN` when `NODE_ENV === "production"`; extract the cookie settings into a pure `refreshCookieOptions(env)` helper (in `backend/src/lib/refresh-tokens.ts`) used by `issueSession`, because `issueSession` writes to the DB before `setCookie` and cannot be tested DB-free; verify `httpOnly`, `sameSite: "lax"`, `secure` only in production, path `/api/v1/auth`, `maxAge`; cover the guard and the helper with DB-free tests (guard + helper + test, not a rewrite).
- [x] B4. Confirm `/auth/refresh` still rejects paused/archived users (already true) and document revocation-on-pause as defense-in-depth, not the primary gate.

### Step C — Tests & Regression Verification

- [x] C1. DB-free backend tests: policy accepts `Password123!` and a 24-char base64url smoke-style password, rejects 9 chars; change schema rejects `newPassword === currentPassword`; production `CORS_ORIGIN` guard rejects wildcard/empty; `AUTH_RATE_LIMIT_MAX` defaults to 30; route contracts — both new routes `401` anonymous, `/users/:id/reset-password` `403` for a signed non-admin token. Also: `refreshCookieOptions` returns `httpOnly: true`, `sameSite: "lax"`, path `/api/v1/auth`, and `secure` true only for `NODE_ENV=production`; a limiter test builds a second app instance with a tiny `AUTH_RATE_LIMIT_MAX` / `RATE_LIMIT_MAX` and uses invalid bodies (Zod 400, no DB) to prove the 429 trip point, per-email bucket independence, the per-IP ceiling across distinct emails, and `change-password` keying by `user.sub`.
- [x] C2. Smoke (real DB), new `auth` domain: run the lifecycle on a dedicated fixture user (`smoke-{runId}-pwuser@smoke.lumina.test`), never on the shared fixture users whose `password` later domains reuse; archive it per the existing convention. Cover: change-password happy path with a rotated `Set-Cookie` (assert `HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth`); wrong current password → `400 INVALID_CURRENT_PASSWORD` (explicitly assert **not** 401); old password rejected at login and new password accepted; other sessions' refresh tokens → `/auth/refresh` 401 after change; admin reset revokes the target's tokens, self-reset → 400, non-admin → 403, unknown id → 404, response never echoes the password; pause and archive revoke the target's tokens; pruning deletes fabricated expired + old-revoked rows for that user on login and keeps fresh and recently-revoked rows. Restore any state it changed in a guaranteed `finally`.
- [x] C3. Playwright: in `frontend/e2e/api/auth.spec.ts` (a) change password through Settings, sign out, old password fails, new password succeeds, wrong current password shows the inline error and the user stays signed in with no extra `/auth/refresh` call, and (b) an admin resets a non-admin account's password through `ResetPasswordModal` (assert `POST /users/:id/reset-password` 200, old password rejected, new accepted); assert the suite does not trip auth `429`s. Use a disposable account created via admin `POST /users` if the student/teacher UI boots for it, otherwise a seeded NON-admin account (never the seeded admin, since an admin cannot self-reset); restore in a guaranteed `finally` by an admin API `POST /users/:id/reset-password` back to `SEEDED_PASSWORD` (works without knowing the current password) and archive any disposable account. In `frontend/e2e/demo/regression.spec.ts` assert Settings shows the demo explainer card with no password inputs and still makes zero `/api/v1/` requests.

---

## Exit Gate

```powershell
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend
npm run smoke
npm run e2e
git diff --check
git status --porcelain -- backend/src/db
# Expected: all exit 0 (the last command prints nothing: no migration, no schema change); auth lifecycle tests pass; demo mode stays zero-API
```

- All checklist items checked
- Wrong current password returns `400 INVALID_CURRENT_PASSWORD`; the client performs no refresh retry and stays signed in
- `AUTH_RATE_LIMIT_MAX` overrides present in smoke + Playwright, so no auth `429`s during either suite
- No new migration was added (Phase 03 stays migration-free)
- Demo mode renders the explainer card only — no password inputs, zero API calls
- Regression check confirms Phase 02 upload scoping & credit rules remain green
- Phase report written to report destination above

---

## Blockers That Would Justify BLOCKED Status

- Phase 02 exit gate not yet passed
- Password change test mutates a seeded account password without guaranteed `finally` restoration (must use a disposable user, or an admin-reset restore in `finally`; never the seeded admin)
- Rate-limit defaults break `npm run smoke` or `npm run e2e` login volume
- Self-reset block is implemented without a documented admin recovery path (see Decision Summary R2 — backlog artifact required, not a Phase 03 blocker)

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC runs once in the outer program loop).

- [x] 1. RESEARCH — auth lifecycle mapped; findings re-verified against source during INNOVATE (no separate artifact persisted): `client.ts` 401 retry path, four `min(8)` password schemas, `refresh_tokens` indexes (only `user_id`), Settings gating on `isApiDataMode()`, people actions in detail-modal footers, smoke password shape, Playwright backend env
- [x] 2. INNOVATE — Decision Summary locked 24-11-26 (see `## Decision Summary` below): 400 `INVALID_CURRENT_PASSWORD`, length-only min-10 policy, no self-reset, per-user prune + hourly sweep with 7-day revocation retention, `!isDemoMode()` gating, shared `ResetPasswordModal`
- [x] 3. PLAN-SUPPLEMENT — checklist, blast radius, contracts, and exit gate refined from the locked decisions (24-11-26)
- [x] 4. PVL — Gate: PASS 24-11-26 (inner-pvl: phase-3) — vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by)
- [x] 5. EXECUTE — implement Steps A–C with per-section gates green (24-11-26; report: `phase-03-auth-lifecycle-hardening_REPORT_24-11-26.md`)
- [x] 6. EVL — all EVL gates + Phase 02 regression checks green; EVL HANDOFF SUMMARY written (independent vc-tester run 24-11-26; `results.tsv` row 1 HALTED_SUCCESS; P3-13 agent-probe recorded as known gap)
- [x] 7. UPDATE PROCESS — closed 24-11-26: phase report updated, 7 backlog notes written, auth/tests/root context updated, umbrella state and registry updated, risk pack decision recorded; commits offered by the orchestrator (program stays in `active/`, Phases 04-06 remain)

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

---

## Touchpoints

- `backend/src/routes/auth.ts`, `backend/src/routes/users.ts`
- `backend/src/lib/password.ts` (shared policy), `backend/src/lib/refresh-tokens.ts` (new helper), `backend/src/lib/activity.ts`
- `backend/src/config/env.ts` (rate limit + production CORS guard), `backend/src/app.ts`
- `backend/src/plugins/auth.ts` (verify-only)
- `backend/tests/{app,contract,password,db-types}.test.ts` (+ optional new `auth-lifecycle.test.ts`), `backend/scripts/smoke.ts`
- `frontend/app/lib/api/auth.ts`, `frontend/app/components/shared/PasswordChangeCard.tsx`
- `frontend/app/components/{manager,teacher,student}/*Settings.tsx`
- `frontend/app/components/manager/PeopleForms.tsx`, `ManagerTeachers.tsx`, `ManagerStudents.tsx`, `frontend/app/components/admin/AdminManagers.tsx`
- `frontend/app/lib/school/{services/people.ts,api/school.ts,notifications.ts}`
- `frontend/e2e/api/auth.spec.ts`, `frontend/e2e/demo/regression.spec.ts`, `frontend/e2e/support/api.ts`, `frontend/playwright.config.ts`

---

## Public Contracts

- `POST /api/v1/auth/change-password` — authenticated. Body `{ currentPassword, newPassword }`. `200 { success: true }` plus a rotated `refresh_token` cookie (all of the user's other refresh tokens revoked). `400 INVALID_CURRENT_PASSWORD` when the current password is wrong (deliberately not 401). `400 VALIDATION_ERROR` when the new password fails policy or equals the current one.
- `POST /api/v1/users/:id/reset-password` — admin-only. Body `{ newPassword }`. `200 { id, success: true }`; all target refresh tokens revoked. `400` when resetting your own account; `403` for non-admins; `404` for an unknown user.
- Password policy tightening (intentional): `/auth/register` and `POST /users` now require 10–128 characters instead of 8–128. No composition rules.
- Existing `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me` response shapes unchanged; auth rate limits return standard `429` only when exceeded.
- Demo mode auth (`NEXT_PUBLIC_DEMO_MODE !== "false"`) remains completely separate from API auth; the password UI is informational only in demo mode.

---

## Verification Evidence

```powershell
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend
npm run smoke
npm run e2e
# Expected: exit 0
```

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-03-auth-lifecycle-hardening_PLAN_23-11-26.md`
- Last completed step: 5. EXECUTE (24-11-26)
- Validate-contract status: PASS (inner-pvl: phase-3, 24-11-26), written below
- Next step: 6. EVL — spawn vc-tester to re-run the validate-contract gates; record the reviewer decision in `harness/phase-03-auth/review-decision.json`.

---

## Decision Summary (INNOVATE — 24-11-26)

Locked decisions (research re-verified against source during INNOVATE):

| # | Decision | Rationale |
|---|---|---|
| 1 | Wrong `currentPassword` → `400` `INVALID_CURRENT_PASSWORD`; success → `{ success: true }` + rotated refresh cookie | `client.ts:52` retries any non-public 401 through `refreshSession()`, so a 401 would rotate tokens needlessly and could sign the user out if the refresh cookie is dead. Auth is valid; the field is wrong. |
| 2 | Length-only `min(10).max(128)`, no composition; one shared schema for register, create-user, change, reset; reject new == current | `Password123!` (12) and the smoke password (24-char base64url, no symbol) both pass; complexity rules would force smoke churn. Replaces the two existing `min(8)` copies (register, create-user) and is reused by the two new routes. |
| 3 | Admin reset is not allowed for self (`400`, points to change-password); admin may reset any other user; revoke target tokens on reset, pause, and archive | A hijacked admin session must not be able to rotate the credential protecting the account. `/refresh` already rejects inactive users, so pause/archive revocation is defense-in-depth + hygiene. |
| 4 | Per-user prune on login + refresh; global sweep ≤1/hour on login; delete expired rows and revoked rows older than 7 days; no migration | `refresh_tokens` only indexes `user_id`, and Phase 03 must stay migration-free. Per-user deletes are indexed; throttling bounds the seq scan. |
| 5 | Password card gated on `!isDemoMode()`, static demo explainer card, shared component in all three Settings pages | Password change is an auth concern; `isApiDataMode()` would hide it in the legitimate `DEMO_MODE=false` + local-data configuration. |
| 6 | One shared `ResetPasswordModal` in `PeopleForms.tsx`, triggered from detail-modal footers, admin-only, hidden in demo mode | Matches the existing `FormModal` + `dialog.kind` patterns and avoids triplication across Managers/Teachers/Students. |

Carry-overs and known risks:

- **R1 — Contract tightening:** register/create now reject passwords under 10 characters. All first-party callers already send 12+.
- **R2 — Single-admin lockout:** blocked self-reset means a forgotten admin password needs manual recovery. Create a backlog artifact for a small `db:reset-password`-style script; do not expand Phase 03.
- **R3 — No `expires_at` index:** the throttled sweep is acceptable at school scale. Backlog: add `refresh_tokens_expires_at_idx` if row count grows.
- **R4 — Session continuity:** change-password revokes other devices but must replace the caller's cookie in the same response; e2e asserts the current device stays signed in.
- **R5 — Rate-limit keying:** login is keyed by `ip + email` (per-account) so school NAT and the e2e suite do not lock out; refresh is keyed by `ip + token-hash prefix`.

---

## Known Gaps (Resolved via Backlog)

Documented residuals found by PVL (24-11-26). Each is pre-classified `known-gap: documented as NEW PLAN REQUIRED` and is written as a backlog NOTE in `process/features/launch-readiness/backlog/` during durable capture. None is an EXECUTE blocker.

- Access JWT is stateless: after a reset, change, pause, or archive, existing access tokens stay valid for up to `ACCESS_TOKEN_TTL` (15 min) because `app.authenticate` only verifies the signature. Refresh-token revocation ends the session at the next refresh. Backlog: `access-token-revocation_NOTE_24-11-26.md` (token version or status check in `authenticate`).
- `trustProxy: true` is unconditional in `buildApp`, so `X-Forwarded-For` is spoofable when the API is reachable without a trusted proxy, which defeats every IP-keyed limiter. Backlog: `trust-proxy-and-limiter-store_NOTE_24-11-26.md` (env-driven `TRUST_PROXY`, settle with Phase 06 deploy topology; also covers the per-process 5000-entry LRU rate-limit store that multi-instance deploys do not share).
- Single-admin lockout (Decision Summary R2): a blocked self-reset means a forgotten admin password needs manual recovery. Backlog: `admin-password-recovery_NOTE_24-11-26.md` (small `db:reset-password`-style script, plus optional manager-scoped reset for their own team; also records reviewer M2: an admin can reset another admin with no step-up).
- No `refresh_tokens.expires_at` index (R3): the hourly sweep is a sequential scan, acceptable at school scale. Backlog: `refresh-token-expiry-index_NOTE_24-11-26.md`.

### Review decision and added backlog (24-11-26, UPDATE PROCESS)

Review decision: **approved-with-concerns** (user option A: no fixes now, all concerns to backlog), recorded in `harness/phase-03-auth/review-decision.json` after an independent vc-code-reviewer static review. Risk-artifact validator: 0 failures. All 7 notes exist in `process/features/launch-readiness/backlog/`:

- The 4 planned notes above.
- `default-account-password_NOTE_24-11-26.md` (M1, HIGH, should-fix before launch / before Phase 06): shared fixed default password for admin-created accounts, no forced change.
- `refresh-and-password-change-atomicity_NOTE_24-11-26.md` (L3, L4): non-atomic refresh claim; change-password session and activity outside the transaction.
- `auth-rate-limit-config_NOTE_24-11-26.md` (L5, L6): no production cap on limiter env, `NODE_ENV` dependence, cookieless refresh bucket, missing `Retry-After`, sameSite lax vs split-origin deploys.
- Known gap P3-13: visual agent-probe of `PasswordChangeCard` / `ResetPasswordModal` at 390px not run (no browser tooling; user did not request a manual check). Copy is asserted by e2e only.

---

## Validate Contract

Status: PASS
Date: 24-11-26
date: 2026-11-24
generated-by: inner-pvl: phase-3

Parallel strategy: sequential
Rationale: 4/7 signals (S2 auth/API surface, S4 phase program, S6 high-risk auth + trust boundary, S7 5+ files; S1 not met: 2 workspaces, S3/S5 not met). Dominant signal: S6. The score reads HIGH, but fit overrides it: the edit chain is dependent (helper before routes before UI) and every hybrid gate shares one database and fixed ports (3000/3100/4000/4100), so parallel editing saves little and risks drift. One opus `vc-execute-agent`, backend first, then frontend.
V2 note: the Layer 1 (4 dimensions) and Layer 2 (Sections A, B, C) checks were executed in-session and sequentially by the validate agent, because a fire-and-forget subagent cannot spawn more agents. Evidence was read from source (`auth.ts`, `users.ts`, `env.ts`, `app.ts`, `schema.ts`, `errors.ts`, `activity.ts`, the installed `@fastify/rate-limit` 10.3.0 source, `client.ts`, Settings components, Playwright configs and specs, smoke script, backend tests).

### Strategy options for EXECUTE (7-signal score 4/7)

| Strategy | Agent count | Model | Cost guard | Fit |
|---|---|---|---|---|
| Sequential (recommended) | 1 executor | opus | none | Dependent edit chain, shared DB and ports for gates |
| Parallel subagents | 2 editors (backend, frontend) + 1 tester = 3 | 2 opus + 1 sonnet | none | Disjoint directories, but gates still serialize and the frontend consumes backend error codes |
| Workflow | 3 steps x 1 agent x 1 pass = 3 (+ fix iterations) | opus for code steps | none | Overkill, no unknown item count |
| Agent team | 3 members (backend opus, frontend opus, security reviewer sonnet) x 2 rounds = 6 | mixed | none (3 <= 6 members) | Only if the user wants live security review during edits |

Phase end: EVL must be a spawned `vc-tester` (sonnet) re-running the gate commands below; never run by the orchestrator in its own shell.

### Plan updates applied (24-11-26)

- [x] P1: B1 rewritten. Route-level limiter must use `hook: "preHandler"` (default `onRequest` runs before body parse and JWT verify, so body/user keys would be empty) and a total, never-throwing `keyGenerator`.
- [x] P2: B1 now keeps a coarse per-IP ceiling. A route-level `config.rateLimit` replaces the global limiter on that route (verified in `index.js` `onRoute`), which would have lifted the per-IP cap from 300/min to unbounded across distinct emails/cookies. The ceiling uses `app.createRateLimit` called manually, NOT a second route limiter (v10's `rateLimitRan` flag makes a second route limiter a silent no-op).
- [x] P3: B3 and C1: cookie flags extracted to a pure `refreshCookieOptions(env)` helper so they can be unit-tested without a database (`issueSession` writes to the DB before `setCookie`); smoke also asserts the `Set-Cookie` attributes.
- [x] P4: C3 split: demo explainer assertion moved to `frontend/e2e/demo/regression.spec.ts` (the API config only runs `e2e/api`); that file and `e2e/support/api.ts` added to Blast Radius and Touchpoints.
- [x] P5: C2/C3 password-mutation safety: smoke uses a dedicated fixture user (later domains reuse the shared fixture `password`); e2e uses a disposable or seeded NON-admin account and restores through an admin `POST /users/:id/reset-password` in `finally` (an admin cannot self-reset, so the seeded admin is never used).
- [x] P6: C3 adds a browser test of `ResetPasswordModal` (admin reset), which doubles as the restore path.
- [x] P7: A1/A2 password update + token revocation in one transaction; custom `AppError(400, "INVALID_CURRENT_PASSWORD")` (the `badRequest` helper hard-codes `BAD_REQUEST`).
- [x] P8: A5 copy corrected: other sessions end within the access-token lifetime (up to 15 min), not "everywhere" (stateless JWT). Frontend has no `ActivityAction` union; only `ACTION_TITLES` and the backend union change.
- [x] P9: B1 literal `Env` list corrected (`app.test.ts`, `contract.test.ts`; `db-types.test.ts` uses `envSchema.parse`); Decision 2 count corrected (two existing `min(8)` copies).
- [x] P10: B2 pruning is best-effort (per-user prune in try/catch; global sweep fire-and-forget with a caught error).
- [x] P11: Exit Gate adds `git status --porcelain -- backend/src/db` (expected empty: no migration, no schema change). Added `## Known Gaps (Resolved via Backlog)` section (4 items).

### Execute-agent instructions

- E1 Order and gates: A0 → A3 (`refresh-tokens.ts`: `revokeUserRefreshTokens`, `pruneRefreshTokens`, `refreshCookieOptions`) → A1/A2 → B1–B3 → backend tests (C1) → run `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend` green → A4/A5 frontend → C2 smoke → C3 e2e. Backend and frontend section gates run sequentially.
- E2 Limiter: use `config.rateLimit: { max: app.config.AUTH_RATE_LIMIT_MAX, timeWindow: "1 minute", hook: "preHandler", keyGenerator }`. `request.body` may be undefined or non-object; the key generator must never throw, must cap length, and must hash user-controlled parts. Verify with the DB-free limiter test (invalid bodies give Zod 400 with no DB) that: the Nth+1 request returns 429, a different email has its own bucket, the per-IP ceiling trips across distinct emails, and change-password keys by `user.sub`. If `app.createRateLimit` is untyped or behaves differently from this contract, stop and report (NEEDS_CONTEXT) rather than dropping the per-IP ceiling.
- E3 Routes: throw `new AppError(400, "INVALID_CURRENT_PASSWORD", ...)` for a wrong current password (never 401: `client.ts` retries any non-public 401 through `/auth/refresh`). Check order in A1: authenticated, caller active, verify current password, reject same password, then transaction (update + revoke), then `issueSession` after commit. A2 never echoes the password; `request.user.sub === id` → 400; unknown id → 404; admin-only via `app.requireRole("admin")`. Log `user.password_changed` / `user.password_reset` (add both to the backend `ActivityAction` union). Revoke tokens in `PATCH /users/:id` only when the status moves away from `active`, and in `DELETE /users/:id`.
- E4 Env: `envSchema.superRefine` keeps `Env = z.infer<typeof envSchema>` valid. `AUTH_RATE_LIMIT_MAX` default 30. Add the field to the literal `Env` objects in `app.test.ts` and `contract.test.ts`. Production guard rejects empty or `*` `CORS_ORIGIN` (and any non-http(s) origin), with a message naming `CORS_ORIGIN`. Do not log secrets.
- E5 Pruning and dev-DB data: retention is expired rows plus revoked rows older than 7 days (`REVOKED_TOKEN_RETENTION_DAYS = 7`). The first login on dev `lumina` after this change runs the global sweep and deletes accumulated expired/old-revoked `refresh_tokens` rows (garbage rows, no user data). This is in-scope and explicitly authorized by this contract for `refresh_tokens` only. Before the first smoke run, record a read-only count of rows matching the retention rule in the phase report. No other deletes, no `db:reset`, `db:push`, or `TRUNCATE`, no migration.
- E6 Password safety: never change the seeded admin's password. Smoke uses a dedicated fixture user. e2e uses a disposable account (admin `POST /users`, archived afterwards) if the UI boots for it, else a seeded non-admin account restored via admin reset in `finally` (re-login as admin inside `finally`, do not reuse an access token that may have expired).
- E7 Frontend: before writing Next code read the relevant `node_modules/next/dist/docs/` guide (see `frontend/AGENTS.md`). Gate the self-service card and the reset UI on `!isDemoMode()`; demo mode renders a static explainer card, no password inputs, zero `/api/v1/` calls (the existing demo regression test already asserts zero API requests; extend it). Mount in `ManagerSettings` (covers admin and manager), `TeacherSettings`, `StudentSettings` under `ACCOUNT ACCESS`. Use `autoComplete="current-password"` / `"new-password"`. The reset action is admin-only. The local-mode `resetPersonPassword` branch returns a clear `fail(...)`.
- E8 Gate hygiene: before `npm run smoke` and `npm run e2e`, confirm ports 3000, 3100, 4000, 4100 are free (a stale backend on :4000 is reused by Playwright's `reuseExistingServer` and would run old code). Run gates one at a time, never in parallel (shared database and ports). An auth 429 during smoke/e2e is a limiter-config bug (the `AUTH_RATE_LIMIT_MAX` override must reach the temp/Playwright backend), not a reason to raise limits further.
- E9 High-risk pack: produce the 5 artifacts in `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/harness/phase-03-auth/`, run `node .claude/skills/vc-risk-evidence-pack/scripts/validate-risk-artifacts.mjs process/features/launch-readiness/active/lumina-v1-finish_23-11-26/harness/phase-03-auth`, and record the reviewer decision before the phase is called ready (see High-risk pack below).
- E10 Phase 02 regression: the full `npm run smoke` (uploads and credits domains) and `npm run e2e` (uploads.spec.ts, booking, credit-concurrency, cancellation-refund) must stay green; do not edit Phase 02 surfaces other than the planned smoke/e2e additions.
- E11 Closeout counts for UPDATE PROCESS (do not edit docs during EXECUTE): backend vitest file/test counts, smoke domain count (14 → 15 with the new `auth` domain) and check count, e2e API/demo test counts, `process/context/tests/all-tests.md`, `process/context/auth/{all-auth,jwt-cookie-flow}.md` (new routes, limits, cookie helper, 10-char policy, 15-min access-token residual), `all-context.md` care areas and gate counts.
- E12 Commit rules: execution commit separate from process/context commit, both on `developing`; commit only on explicit user request.

### Test gates (run after each section; regression suite after all sections)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| P3-1 | Shared password policy: 10–128 chars, accepts `Password123!` and a 24-char base64url string, rejects 9 chars; change schema rejects `newPassword === currentPassword` | Fully-Automated | `npm run test --workspace @lumina/backend` (password policy cases) | B |
| P3-2 | Env: `AUTH_RATE_LIMIT_MAX` defaults to 30; production `CORS_ORIGIN` empty or `*` rejected, valid explicit origin accepted | Fully-Automated | `npm run test --workspace @lumina/backend` (`db-types.test.ts` env cases) | B |
| P3-3 | Route contracts: `POST /auth/change-password` 401 anonymous; `POST /users/:id/reset-password` 401 anonymous and 403 for a signed student token | Fully-Automated | `npm run test --workspace @lumina/backend` (`contract.test.ts`) | B |
| P3-4 | `refreshCookieOptions`: httpOnly, `sameSite: "lax"`, path `/api/v1/auth`, `secure` only in production | Fully-Automated | `npm run test --workspace @lumina/backend` (`auth-lifecycle.test.ts` or `app.test.ts`) | B |
| P3-5 | Limiter: 429 after the cap, per-email buckets independent, per-IP ceiling trips across distinct emails, change-password keyed by `user.sub`, `hook: preHandler` ordering | Fully-Automated | `npm run test --workspace @lumina/backend` (limiter cases, invalid bodies, no DB) | B |
| P3-6 | Static health: typecheck, lint, no merge markers, no migration or schema change | Fully-Automated | `npm run typecheck`; `npm run lint`; `git diff --check`; `git status --porcelain -- backend/src/db` prints nothing | A |
| P3-7 | Change password: happy path, rotated `Set-Cookie`, wrong current → `400 INVALID_CURRENT_PASSWORD` (not 401), old password rejected, new accepted, other sessions' refresh → 401 | Hybrid | `npm run smoke` (`auth` domain) — precondition: local Postgres + `backend/.env`, port 4100 free | B |
| P3-8 | Admin reset: revokes target tokens, self-reset 400, non-admin 403, unknown 404, never echoes password; pause and archive revoke tokens | Hybrid | `npm run smoke` (`auth` domain) | B |
| P3-9 | Prune: expired and old-revoked rows deleted on login, fresh and recently-revoked rows kept; no migration needed | Hybrid | `npm run smoke` (`auth` domain, fabricated rows) | B |
| P3-10 | Browser: Settings change password (old fails, new works, wrong current stays signed in with no extra refresh), admin `ResetPasswordModal` flow, no auth 429s | Hybrid | `npm run e2e` (`frontend/e2e/api/auth.spec.ts`) — precondition: seeded DB, ports 3000/3100/4000 free | B |
| P3-11 | Demo mode: explainer card only, no password inputs, zero `/api/v1/` requests | Hybrid | `npm run e2e` (`frontend/e2e/demo/regression.spec.ts`) | B |
| P3-12 | Phase 02 regression: upload scoping and staff-managed credits still hold; booking, refund, and credit-concurrency suites green with the new limiter env | Hybrid | `npm run smoke` (`uploads`, `credits`) + `npm run e2e` (`uploads`, `booking`, `cancellation-refund`, `credit-concurrency`) | A |
| P3-13 | UI judgment: card and modal layout, copy accuracy (15-minute wording), 3 roles + admin, no layout break at 390px | Agent-Probe | `vc-agent-browser` against API-mode `npm run dev` or the e2e stack: open Settings in each role, open the reset modal as admin, read the copy | D |

Failing stubs (Fully-Automated rows; red-first starting points, not on-disk files):

```
// P3-1
test("should accept 10-128 char passwords and reject 9", () => { throw new Error("NOT IMPLEMENTED — TDD stub: shared password policy") })
// P3-2
test("should default AUTH_RATE_LIMIT_MAX to 30 and reject wildcard CORS_ORIGIN in production", () => { throw new Error("NOT IMPLEMENTED — TDD stub: env defaults and production CORS guard") })
// P3-3
test("should return 401 anonymous and 403 for a student token on the new auth routes", () => { throw new Error("NOT IMPLEMENTED — TDD stub: new route contracts") })
// P3-4
test("should build refresh cookie options with secure only in production", () => { throw new Error("NOT IMPLEMENTED — TDD stub: refreshCookieOptions") })
// P3-5
test("should return 429 after the auth cap with per-email buckets and a per-IP ceiling", () => { throw new Error("NOT IMPLEMENTED — TDD stub: auth limiter keying") })
// P3-6 is command-only (no stub)
```

Legacy line form (retained for existing consumers):
- Backend policy, env, contracts, cookie, limiter: [Fully-automated: `npm run test --workspace @lumina/backend`]
- Static: [Fully-automated: `npm run typecheck`] | [Fully-automated: `npm run lint`] | [Fully-automated: `git diff --check`] | [Fully-automated: `git status --porcelain -- backend/src/db` empty]
- Auth lifecycle API: [hybrid: `npm run smoke` + local Postgres + backend env file]
- Auth UI: [hybrid: `npm run e2e` + seeded Postgres + ports 3000/3100/4000 free]
- Demo fence: [hybrid: `npm run e2e` (demo regression spec)]
- UI copy/layout: [agent-probe: Settings + reset modal across roles via `vc-agent-browser`]
- Access-token revocation, proxy trust, admin recovery, expiry index: [known-gap: documented as NEW PLAN REQUIRED — see Known gaps on record]

Never a gate: `npm run db:reset`, `db:push`, TRUNCATE (destructive; see E5/E6).

**Regression suite (after all sections complete):** `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend`, `npm run smoke`, `npm run e2e`, `git diff --check`, `git status --porcelain -- backend/src/db`. Plan-artifact validator for the plan file after closeout edits: `node .claude/skills/vc-generate-phase-program/scripts/validate-phase-stub.mjs <this plan>`.

### Dimension findings

- Infra fit: PASS — every referenced path exists except the intended new files (`PasswordChangeCard.tsx`, `refresh-tokens.ts`, optional `auth-lifecycle.test.ts`); `schema.ts` already has `refresh_tokens(user_id, token_hash unique, expires_at, revoked_at, created_at)` with the `user_id` index, so no migration is needed; ports 3000/3100/4000/4100 are free; `frontend/app/components/shared/` exists (holds `Modal.tsx`).
- Test coverage: PASS — after fixes: cookie flags and limiter keying are DB-free testable, admin reset has browser coverage, demo assertion lives in the spec that runs the demo config, password-mutation safety is specified. Plan-structure advisory: `validate-plan-artifact.mjs` prints 6 generic FAILs (Date/Status/Complexity metadata, overview, Phase Completion Rules, Acceptance Criteria) that do not apply to phase-program stubs; Phase 02's accepted plan produces the identical 6 and `validate-phase-stub.mjs` reports 0 failures for this plan before and after the updates.
- Breaking changes: PASS — password policy tightens 8 → 10 for `/auth/register` and `POST /users` (declared, intentional; all first-party callers send 12+: `Password123!`, smoke 24-char); two new routes are additive; no response shape of login/refresh/logout/me changes; `Env` gains one defaulted field (literal `Env` objects in two tests updated); no schema, migration, or `types.ts` change, so the cross-workspace contract test is unaffected.
- Security surface: PASS — after fixes (STRIDE): spoofing/brute force (limiter keyed per account plus per-IP ceiling; `X-Forwarded-For` spoofing remains a documented known gap), repudiation (activity log rows for change/reset), information disclosure (reset never echoes the password; wrong-current uses a distinct 400 only for an authenticated caller), denial of service (scrypt-bound routes limited), elevation of privilege (reset admin-only, self-reset blocked, role check precedes handler). Residual: stateless access JWT (known gap).
- Section A feasibility (password change and reset, API + UI): PASS — edit targets match source (`registerSchema` line 25, `createUserSchema` line 47, `issueSession`, `PATCH`/`DELETE /users/:id`, `ConfirmStatusModal`, `Dialog` unions, `ACCOUNT ACCESS` panels in all three Settings); highest-risk edit: A1 transaction plus session rotation, sequence it before the UI and cover with smoke.
- Section B feasibility (limits, token hygiene, prod config): PASS — `@fastify/rate-limit` 10.3.0 supports route-level `hook`, `keyGenerator`, and `max`; the global limiter is replaced per route and the `rateLimitRan` flag blocks a second route limiter (both handled in the plan); highest-risk edit: B1 keying hook placement, prove with the limiter test before wiring smoke/e2e overrides.
- Section C feasibility (tests and regression): PASS — test counts, env literals, smoke fixture and `loadEnv` map, Playwright webServer env, and `signIn`/`apiLogin` helpers verified; highest-risk edit: any test that mutates a real account password, mitigated by E6.

Open gaps: none unresolved. Deferred (not counted as CONCERN/FAIL):
- Access JWT not revocable for up to 15 minutes: known-gap: documented as NEW PLAN REQUIRED — see backlog/access-token-revocation_NOTE_24-11-26.md
- `trustProxy: true` unconditional and per-process limiter store: known-gap: documented as NEW PLAN REQUIRED — see backlog/trust-proxy-and-limiter-store_NOTE_24-11-26.md
- Single-admin lockout and manager-scoped reset: known-gap: documented as NEW PLAN REQUIRED — see backlog/admin-password-recovery_NOTE_24-11-26.md
- No `refresh_tokens.expires_at` index: known-gap: documented as NEW PLAN REQUIRED — see backlog/refresh-token-expiry-index_NOTE_24-11-26.md

### What This Coverage Does NOT Prove

- Vitest (P3-1 to P3-5): does not prove any real database behavior (revocation, prune, transactions), real browser cookie handling, or limiter behavior across multiple processes or behind a real proxy (`X-Forwarded-For` trust is untested).
- Smoke (P3-7 to P3-9): proves refresh-token revocation and prune against local Postgres, not that already-issued access JWTs stop working (they remain valid up to 15 minutes), not production `secure` cookies over HTTPS, and not the real (30/min) limiter values because smoke runs with the 100000 override.
- E2E (P3-10, P3-11): proves the browser flows for three roles at most with one disposable/non-admin account, not every role's Settings page, not password-manager behavior, not the limiter under the default 30/min, and not a forgotten-admin recovery path.
- Phase 02 regression (P3-12): proves the named suites stay green, not that unrelated future upload/credit changes are safe.
- Static gates (P3-6): prove types, lint, and absence of a migration, not runtime behavior.
- Agent-probe (P3-13): a judgment of copy and layout, not an automated assertion.

### High-risk pack

Required: yes. Risk class: auth or identity (secondary: permission, secret, or trust-boundary logic: rate limits, CORS, cookie flags). `mustStopBeforeFinalize: true`.
Artifacts (execute-agent produces; manual-first, not a blocking hook) in `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/harness/phase-03-auth/`:
- `risk-gate.json`: riskClass, workDescription, approver, `mustStopBeforeFinalize: true`.
- `context-snippets.json`: file:line citations for `issueSession`, the new change/reset handlers, `revokeUserRefreshTokens`/`pruneRefreshTokens`, the limiter config, the production CORS guard, `refreshCookieOptions`, the `!isDemoMode()` gates.
- `verification.json`: steps with PASS/FAIL, covering the happy path and at least these boundaries: wrong current password (400 not 401), self-reset 400, non-admin 403, old refresh token 401 after reset/change/pause, limiter 429 trip, prune keeps recent rows, demo mode zero API calls.
- `review-decision.json`: explicit APPROVE or REJECT with rationale and timestamp from a reviewer (`vc-code-reviewer` or equivalent), recorded before UPDATE PROCESS closes the phase.
- `adversarial-validation.json`: scenarios with `ruled_out` and rationale, at minimum: stolen access token tries change-password without the current password; hijacked admin session self-resets; refresh-token replay after reset; limiter evasion with rotating emails or random cookies; `X-Forwarded-For` spoof (ruled_out: false, carried by the known gap); wildcard CORS in production; demo-mode code reaching the API; mass assignment on reset (`newPassword` only).
Validate with `node .claude/skills/vc-risk-evidence-pack/scripts/validate-risk-artifacts.mjs process/features/launch-readiness/active/lumina-v1-finish_23-11-26/harness/phase-03-auth`. If the pack is missing at closeout, report that explicitly; do not imply the phase is proven.

### Backlog artifacts to create during durable capture

All in `process/features/launch-readiness/backlog/`:
- `access-token-revocation_NOTE_24-11-26.md`: token version or status check in `authenticate` so reset/pause/change ends access immediately.
- `trust-proxy-and-limiter-store_NOTE_24-11-26.md`: env-driven `TRUST_PROXY`, shared limiter store for multi-instance deploys (settle with Phase 06 deploy topology).
- `admin-password-recovery_NOTE_24-11-26.md`: `db:reset-password`-style script for a locked-out single admin, plus optional manager-scoped reset for own team.
- `refresh-token-expiry-index_NOTE_24-11-26.md`: add `refresh_tokens_expires_at_idx` if row count grows (needs a migration, so a separate phase).

### Known gaps on record

- Access JWT stays valid up to `ACCESS_TOKEN_TTL` after a reset, change, pause, or archive; only refresh is cut. Accepted: school scale, 15-minute window, documented in UI copy, backlog note above.
- `X-Forwarded-For` trust and the per-process limiter store. Accepted: deploy topology is decided in Phase 06 / v1.1; backlog note above.
- Single-admin lockout needs manual DB recovery. Accepted as Decision R2; backlog note above (not an EXECUTE blocker).
- No `expires_at` index; the hourly sweep is a sequential scan. Accepted at school scale; backlog note above.

Gate: PASS (0 FAILs, 0 unresolved CONCERNs; 8 concerns found and fixed in the plan text or as execute-agent instructions, 4 residual known-gaps documented as backlog)
Accepted by: session (autonomous, standing program autonomy per the orchestrator instruction; no user present at V5). Concerns resolved: B1 limiter hook placement; B1 lost per-IP ceiling; cookie-flag testability; demo assertion location and blast radius; password-mutation safety in smoke/e2e; admin-reset browser coverage; stateless-JWT copy accuracy; plan inaccuracies (Env literals, ActivityAction, min(8) count). Known-gaps accepted by name: access-token revocation window, trustProxy and limiter store, single-admin recovery, refresh-token expiry index. Final user consent still required via explicit `ENTER EXECUTE MODE`.
