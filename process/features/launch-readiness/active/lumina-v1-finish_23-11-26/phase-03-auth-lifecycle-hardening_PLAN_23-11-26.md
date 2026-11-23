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
**Phase status:** ⏳ PLANNED
**Report destination:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-03-auth-lifecycle-hardening_REPORT_23-11-26.md (flat in the program task folder)

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

- `backend/src/routes/auth.ts`
- `backend/src/routes/users.ts`
- `backend/src/plugins/auth.ts`
- `backend/src/config/env.ts`
- `backend/src/app.ts`
- `backend/src/lib/activity.ts`
- `backend/tests/app.test.ts`
- `backend/tests/contract.test.ts`
- `backend/tests/password.test.ts`
- `backend/scripts/smoke.ts`
- `frontend/app/lib/api/auth.ts`
- `frontend/app/components/manager/ManagerSettings.tsx`
- `frontend/app/components/teacher/TeacherSettings.tsx`
- `frontend/app/components/student/StudentSettings.tsx`
- `frontend/app/components/manager/PeopleForms.tsx`
- `frontend/e2e/api/auth.spec.ts`

---

## Implementation Checklist

### Step A — Password Change & Admin Reset (API + UI)

- [ ] A1. Add `POST /auth/change-password` (authenticated: verifies `currentPassword`, validates `newPassword` strength, updates `passwordHash`, revokes existing refresh tokens, rotates current session cleanly, logs activity).
- [ ] A2. Add `POST /users/:id/reset-password` (admin-only: validates `newPassword`, updates `passwordHash`, revokes all refresh tokens for target user, logs activity).
- [ ] A3. Wire API-mode password-change controls into Settings (hidden or clearly marked demo-only in demo mode) and admin password-reset action in user management, without leaking any mock auth behavior into API mode.

### Step B — Rate Limits, Token Hygiene & Prod Cookie/CORS Config

- [ ] B1. Configure stricter per-route rate limits on `/auth/login`, `/auth/refresh`, and `/auth/change-password` with an env override (`AUTH_RATE_LIMIT_MAX`) for local smoke/e2e runs.
- [ ] B2. Prune expired/revoked `refresh_tokens` rows deterministically (helper invoked safely during auth lifecycle + covered by unit/smoke test).
- [ ] B3. Audit and enforce production cookie (`secure` in production, `httpOnly`, `sameSite`) and `CORS_ORIGIN` validation (reject wildcard/empty origin in production) in `env.ts` / `app.ts` / `auth.ts`.

### Step C — Tests & Regression Verification

- [ ] C1. Add backend unit/contract tests for password change/reset, rate-limit config, and production env validation.
- [ ] C2. Add smoke + Playwright `auth.spec.ts` coverage (change password, old password rejected, new password succeeds, restore original test password in `finally`).

---

## Exit Gate

```powershell
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend
npm run smoke
npm run e2e
git diff --check
# Expected: all exit 0; auth lifecycle tests pass; demo mode stays zero-API
```

- All checklist items checked
- Regression check confirms Phase 02 upload scoping & credit rules remain green
- Phase report written to report destination above

---

## Blockers That Would Justify BLOCKED Status

- Phase 02 exit gate not yet passed
- Password change test mutates a seeded account password without guaranteed `finally` restoration (must use disposable user or guaranteed restore)
- Rate-limit defaults break `npm run smoke` or `npm run e2e` login volume

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC runs once in the outer program loop).

- [ ] 1. RESEARCH — research-agent: inspect `routes/auth.ts`, `plugins/auth.ts`, `config/env.ts`, `app.ts`, and Settings components
- [ ] 2. INNOVATE — innovate-agent: decide password policy, token revocation/pruning strategy, and UI placement; write Decision Summary
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: refine checklist and blast radius from research (or mark "n/a — research clean")
- [ ] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by)
- [ ] 5. EXECUTE — implement Steps A–C with per-section gates green
- [ ] 6. EVL — all EVL gates + Phase 02 regression checks green; EVL HANDOFF SUMMARY written
- [ ] 7. UPDATE PROCESS — phase report written, auth context docs (`process/context/auth/*`) & umbrella state updated, commits done

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

---

## Touchpoints

- `backend/src/routes/auth.ts`, `backend/src/routes/users.ts`
- `backend/src/plugins/auth.ts`, `backend/src/config/env.ts`, `backend/src/app.ts`, `backend/src/lib/activity.ts`
- `backend/tests/{app,contract,password}.test.ts`, `backend/scripts/smoke.ts`
- `frontend/app/lib/api/auth.ts`, Settings & People components, `frontend/e2e/api/auth.spec.ts`

---

## Public Contracts

- New endpoints: `POST /api/v1/auth/change-password` (authenticated), `POST /api/v1/users/:id/reset-password` (admin-only).
- Existing `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me` response shapes unchanged.
- Demo mode auth (`NEXT_PUBLIC_DEMO_MODE !== "false"`) remains completely separate from API auth.

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
- Last completed step: not started
- Validate-contract status: pending
- Next step: Wait for Phase 02 exit gate, then start Phase 03 RESEARCH (Step 1).

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
