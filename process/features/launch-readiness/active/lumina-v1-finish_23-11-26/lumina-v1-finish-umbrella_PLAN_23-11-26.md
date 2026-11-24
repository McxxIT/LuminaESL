---
name: plan:lumina-v1-finish-umbrella
description: "Lumina ESL v1 Finish — umbrella/orchestration plan for the 6-phase launch-readiness program"
date: 23-11-26
metadata:
  node_type: memory
  type: plan
  feature: launch-readiness
  phase: umbrella
---

# Lumina ESL v1 Finish — Umbrella Plan

**Date:** 23-11-26
**Complexity:** COMPLEX
**Status:** ⏳ PLANNED

- Program type: PHASE PROGRAM (6 phases, sequential with gated joins)
- Date: 23-11-26
- Feature folder: `process/features/launch-readiness/`
- Program folder (flat): `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/`

---

## Program Goal Charter

```
Lumina ESL v1 Finish — Program Goal Charter

North star:
- Take Lumina ESL from its completed local-MVP backend cutover to a hardened, feature-complete,
  CI-verified, Docker-runnable v1 release across all four roles.

Definition of done (an unattended agent or clean checkout must be able to do all of these):
1. Apply all Drizzle migrations (including 0004+) cleanly on dev `lumina` and fresh Postgres DBs,
   and run `npm run smoke` and `npm run e2e` directly without database overrides.
2. Enforce per-record upload download authorization and staff-only credit top-ups in API mode,
   plus hardened auth lifecycle (password change/admin reset, auth rate limits, token cleanup,
   production cookie/CORS).
3. Manage reusable Curriculum Library materials (admin/manager upload -> teacher attach to
   lesson/booking -> student/parent view/download) in both API and demo modes.
4. Pass parity polish (rebook semantics, "credits" copy, 390px mobile tabs) and automated frontend
   Vitest unit tests alongside backend Vitest, live smoke, and Playwright e2e suites.
5. Boot the full stack (Postgres + Fastify API + Next.js web) via `docker compose up` and run the
   full automated gate suite in GitHub Actions CI from a clean checkout.

What "verified" means (program level):
- Every phase has its own validate-contract written before EXECUTE, all in-blast-radius automated
  and hybrid gates green, regression checks recorded against overlapping prior surfaces, a durable
  phase report written, and separate execution vs. process commits on `developing`.
- validate-contract gates must be recorded alongside phase gates and regression evidence for a
  phase to reach VERIFIED. A phase without a validate-contract (or documented skip reason)
  cannot be marked VERIFIED.

Scope tiers -> phase mapping:
- Tier 1 Foundation & Data Integrity -> Phase 01 (Dev DB migration 0004 alignment)
- Tier 2 Security, Billing & Auth Hardening -> Phases 02, 03
- Tier 3 Product Completion & Test Depth -> Phases 04 (Curriculum Library), 05 (Polish + Vitest)
- Tier 4 Packaging & Automated CI -> Phase 06 (CI + Docker Compose)
- This program retires Tiers 1-4.

Explicitly out of scope (deferred tier — v1.1+):
- Cloud hosting deployment (Vercel / VPS / managed Postgres provisioning)
- External cloud object storage (S3 / R2) — v1 keeps persistent local/Docker `UPLOAD_DIR` volume
- Real payment provider integration (Stripe Checkout / webhooks) — v1 uses staff-managed credits
- External email delivery provider (SMTP / Resend) — v1 uses self-service password change +
  admin-issued password reset with a clean hook for future email delivery

Hard safety constraints (non-negotiable, per phase):
- NEVER run `db:reset`, `db:push`, or `TRUNCATE` as a verification gate or without explicit approval.
- NEVER silently delete or merge dev `lumina` rows; Phase 01 cleanup requires explicit user
  approval of the exact row IDs and a pre-change backup/snapshot.
- Keep `NEXT_PUBLIC_DEMO_MODE` (mock/local) strictly separate from real JWT/API auth; zero demo
  data leakage into API mode.
- Keep Drizzle migrations in `backend/src/db/migrations/` synced with `schema.ts`, API routes,
  `frontend/app/lib/school/types.ts`, and `backend/tests/contract.test.ts`.
- Commit directly on `developing` (solo-dev repo rule); commit each phase's execution changes
  before starting the next phase and keep process/plan/context commits separate.
```

---

## Stable Program Goal (copy-paste this to start autonomous execution)

```
SESSION GOAL: launch-readiness — Lumina ESL v1 Finish
Ref: process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md

TARGET: Complete Phases 01-06 until:
- Dev `lumina` is aligned on migration 0004+, upload downloads are scoped, student self-purchase
  is staff-managed in API mode, auth lifecycle is hardened, Curriculum Library + polish + Vitest
  are shipped, and Docker Compose + GitHub Actions CI are green.
- All phase exit gates, regression checks, and validators exit 0.
- Test tiers: automated (iterate-until-green) / hybrid (fix-if-in-blast-radius) / agent-probe (record-judgment)

AUTONOMY: Before ANY subagent spawn, read:
1. Umbrella ## Current Execution State -> loop step + validate-contract status
2. Phase plan ## Phase Loop Progress -> first unchecked box = next subagent to spawn

PER-PHASE LOOP (7-step inner loop `R -> I -> P -> PVL -> E -> EVL -> UP`, never skip, never reorder; SKIPS SPEC — SPEC runs once in the outer program loop):
  1. RESEARCH -> 2. INNOVATE -> 3. PLAN-SUPPLEMENT -> 4. PVL -> 5. EXECUTE -> 6. EVL -> 7. UPDATE-PROCESS
- PLAN-SUPPLEMENT: plan-agent writes research/innovate gaps into phase plan (or marks "n/a — clean")
- PVL NEVER skipped; contract must follow example-validate-output.md full format; partial contract = blocked
- Every subagent FIRST ACTION: vc-context-discovery + vc-plan-discovery
- Every phase-END: invoke vc-agent-strategy-compare for next step strategy recommendation

HARD STOPS (pause, wait for user):
- Any destructive DB mutation on dev `lumina` without explicit row-level approval (Phase 01)
- Irreversible/outward-facing action without explicit validate-contract instruction
- Net gate = BLOCKED with no backlog resolution path
- Validate-contract is placeholder and vc-validate-agent cannot run

SAFETY (never override):
- Never run `db:reset`, `db:push`, or `TRUNCATE` as a verification gate
- Keep demo mode strictly fenced from API mode; keep schema/migrations/types/contract tests synced
- Commit each phase on `developing` before advancing; execution and process commits separate

TEST GATES (every phase exit):
  npm run typecheck
  npm run lint
  npm run test --workspace @lumina/backend
  npm run smoke
  npm run e2e
  node .claude/skills/vc-audit-plans/scripts/validate-plan-inventory.mjs
  node .claude/skills/vc-audit-context/scripts/validate-context-discovery.mjs
  node .claude/skills/vc-generate-context/scripts/validate-all-context.mjs
  node .claude/skills/vc-generate-phase-program/scripts/validate-umbrella-artifact.mjs process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md
  node .claude/skills/vc-generate-phase-program/scripts/validate-phase-stub.mjs

VALIDATE CONTRACT: Per-phase contracts written by vc-validate-agent into each phase plan before EXECUTE.

START: Phase 01, loop step RESEARCH (pending). Spawn vc-research-agent for Phase 01.
```

---

## Phase Ordering

| Phase | Plan file | Scope summary | Depends on |
|---|---|---|---|
| 0 (pre-program) | this file | Confirm folder structure, baseline audit, create umbrella + 6 phase stubs + registry | — |
| 01 — Dev DB Migration 0004 Alignment | `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-01-dev-db-migration-0004_PLAN_23-11-26.md` | Reviewed cleanup of 13 duplicate test-residue rows in dev `lumina`, apply migration `0004`, confirm default `smoke`/`e2e` pass | Phase 0 |
| 02 — Security & Staff-Managed Credits | `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-02-security-and-credits-policy_PLAN_23-11-26.md` | Per-record authorization on `GET /uploads/:id{,/download}` + staff-only credits in API mode (disable student self-purchase) | Phase 01 |
| 03 — Auth & Account Lifecycle Hardening | `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-03-auth-lifecycle-hardening_PLAN_23-11-26.md` | Password change + admin password reset, login/refresh rate limits, expired refresh-token cleanup, production cookie/CORS hardening | Phase 02 |
| 04 — Curriculum Library | `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-04-curriculum-library_PLAN_23-11-26.md` | Reusable shared materials library (admin/manager upload -> teacher attach to lesson/booking -> student/parent view/download) | Phase 02 |
| 05 — Parity Polish & Frontend Unit Tests | `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-05-parity-polish-and-unit-tests_PLAN_23-11-26.md` | Rebook enrichment, "credits" copy cleanup, 390px mobile tab fixes, and frontend Vitest runner for local school services | Phase 04 |
| 06 — CI & Docker Compose Packaging | `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-06-ci-and-docker-compose_PLAN_23-11-26.md` | Dockerfiles + `docker-compose.yml` (Postgres + API + Web + volume + readiness) + GitHub Actions CI running full gates | Phases 01–05 |

### Join Conditions

- Phase 01 MUST NOT start until Phase 0 scaffold and validators pass.
- Phase 02 MUST NOT start until Phase 01 exit gate passes (default dev DB is migrated and green).
- Phase 03 MUST NOT start until Phase 02 exit gate passes.
- Phase 04 MUST NOT start until Phase 02 exit gate passes (Curriculum Library downloads build on Phase 02's upload scoping); sequential order runs Phase 03 before Phase 04.
- Phase 05 MUST NOT start until Phase 04 exit gate passes so unit tests and copy/UI polish cover the finished Curriculum Library too.
- Phase 06 MUST NOT start until Phases 01–05 exit gates all pass so CI and Docker package the final app and full test suite.

---

## Per-Phase Entry / Exit Gates

| Phase | Entry | Exit gate |
|---|---|---|
| 0 | User approval of kickoff recommendation | Umbrella + 6 phase stubs + blast-radius registry created; context feature list updated; umbrella & stub validators exit 0 |
| 01 | Phase 0 complete | User-approved cleanup executed on dev `lumina` after snapshot; `0004` applied; `npm run smoke` (14/14) and `npm run e2e` (23 API + 3 demo) pass without `DATABASE_URL` override |
| 02 | Phase 01 exit met | Unauthorized `/uploads/:id{,/download}` returns 403; authorized roles download identical bytes; student `POST /credits` purchase rejected in API mode (403) while admin/manager credits work; demo mode intact; smoke + e2e green |
| 03 | Phase 02 exit met | Self-service password change + admin reset verified (revokes old refresh tokens); login/refresh rate limits & expired-token cleanup tested; prod cookie/CORS config verified; unit + smoke + e2e green |
| 04 | Phase 03 exit met | Migration applied; admin/manager CRUD on library items; teacher attaches item to lesson/booking; student views/downloads via Phase 02 scoped download; unauthorized user gets 403; demo parity + smoke + e2e green |
| 05 | Phase 04 exit met | Rebook semantics aligned & asserted in smoke; visible "credit hours" copy updated to "credits"; 390px tab overflow fixed; `npm run test --workspace @lumina/frontend` passes Vitest service tests; e2e green |
| 06 | Phases 01–05 exits met | `docker compose up --build` boots Postgres + API + Web healthy with migrations/seed and persistent uploads; GitHub Actions workflow YAML valid and covers typecheck, lint, backend+frontend tests, migrate, seed, smoke, e2e; README clean-checkout steps verified |

---

## Per-Phase Loop

Each phase executes the canonical 7-step inner loop `R → I → P → PVL → E → EVL → UP`. This inner loop SKIPS SPEC — the program charter governs all 6 phases.

1. **RESEARCH** — read phase plan, prior phase reports, context docs, and live code/DB state; document findings
2. **INNOVATE** — decide approach; write Decision Summary (chosen approach + rejected alternatives)
3. **PLAN-SUPPLEMENT** — update phase plan checklist/touchpoints from research/innovate (or mark `"n/a — research clean"`)
4. **PVL** — full V1–V7 validation; write `## Validate Contract` into the phase plan before EXECUTE
5. **EXECUTE** — implement approved phase scope only; run per-section test gates inline
6. **EVL** — independently verify phase test gates + regression checks against overlapping prior phases
7. **UPDATE-PROCESS** — write phase report to Durable Report Destinations, update context docs, commit execution & process changes separately, rewrite `## Current Execution State` below

**PVL is NEVER skipped.** A placeholder `## Validate Contract` = blocked.

---

## Global Constraints

- Never run `db:reset`, `db:push`, or `TRUNCATE` as a verification gate.
- Never silently mutate or delete dev `lumina` data; require explicit user approval and snapshot first.
- Keep `NEXT_PUBLIC_DEMO_MODE` strictly separated from API/JWT auth (`isApiDataMode()`).
- Keep `backend/src/db/schema.ts`, generated Drizzle migrations, `backend/src/routes/*`, `frontend/app/lib/school/types.ts`, and `backend/tests/contract.test.ts` strictly in sync.
- Commit directly on `developing` after each phase; keep execution commits separate from process/context commits.
- Blast-radius ownership across phases is tracked in `phase-blast-radius-registry.md`.

---

## Durable Report Destinations

| Phase | Report path (flat inside program task folder) |
|---|---|
| 0 (pre-program) | `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md` (this file) |
| 01 — Dev DB Migration 0004 Alignment | `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-01-dev-db-migration-0004_REPORT_23-11-26.md` |
| 02 — Security & Staff-Managed Credits | `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-02-security-and-credits-policy_REPORT_23-11-26.md` |
| 03 — Auth & Account Lifecycle Hardening | `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-03-auth-lifecycle-hardening_REPORT_24-11-26.md` |
| 04 — Curriculum Library | `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-04-curriculum-library_REPORT_23-11-26.md` |
| 05 — Parity Polish & Frontend Unit Tests | `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-05-parity-polish-and-unit-tests_REPORT_23-11-26.md` |
| 06 — CI & Docker Compose Packaging | `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-06-ci-and-docker-compose_REPORT_23-11-26.md` |

---

## Program Status Table

| Phase | Status |
|---|---|
| 0 — Pre-program (scaffold & baseline) | ✅ COMPLETE |
| 01 — Dev DB Migration 0004 Alignment | ✅ VERIFIED |
| 02 — Security & Staff-Managed Credits | ✅ VERIFIED |
| 03 — Auth & Account Lifecycle Hardening | ✅ VERIFIED (with gaps: P3-13; review approved-with-concerns) |
| 04 — Curriculum Library | ✅ VERIFIED (with gaps: AC-11 API-mode visual probe pending; review approved-with-concerns) |
| 05 — Parity Polish & Frontend Unit Tests | ⏳ PLANNED |
| 06 — CI & Docker Compose Packaging | ⏳ PLANNED |

Status values: ⏳ PLANNED | 🔨 CODE DONE | 🧪 TESTING | ✅ VERIFIED | 🚧 BLOCKED | ✅ COMPLETE

---

## Touchpoints

- Phase 01: dev PostgreSQL `lumina` (backup + reviewed cleanup + `db:migrate`), `process/context/{all-context.md,database/*,tests/all-tests.md}`, `booking-credit-concurrency_NOTE_18-11-26.md`
- Phase 02: `backend/src/routes/{uploads,credits}.ts`, `backend/src/lib/scope.ts`, `backend/scripts/smoke.ts`, `backend/tests/contract.test.ts`, `frontend/app/components/student/StudentBilling.tsx`, `frontend/e2e/api/{uploads,booking,credit-concurrency}.spec.ts`
- Phase 03: `backend/src/routes/{auth,users}.ts`, `backend/src/plugins/auth.ts`, `backend/src/config/env.ts`, `backend/src/app.ts`, `frontend/app/lib/api/auth.ts`, `frontend/app/components/{manager,teacher,student}/*Settings.tsx`, `backend/tests/*`, `frontend/e2e/api/auth.spec.ts`
- Phase 04: `backend/src/db/{schema.ts,migrations/0005_*.sql}`, `backend/src/routes/{library,lessons,school,uploads}.ts`, `frontend/app/lib/school/{types,store,seed,services/*,api/*}.ts`, `frontend/app/components/{manager,teacher,student}/*`, `backend/scripts/smoke.ts`, `frontend/e2e/api/*`
- Phase 05: `backend/src/routes/lessons.ts`, `backend/scripts/smoke.ts`, `frontend/package.json`, `frontend/vitest.config.ts`, `frontend/tests/*`, `frontend/app/{globals.css,lib/data.ts,components/**/*}`
- Phase 06: `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.github/workflows/ci.yml`, `README.md`, `backend/src/app.ts` (readiness probe)

---

## Public Contracts

- Existing API routes under `/api/v1` keep backward-compatible response shapes unless explicitly noted per phase (Phase 02 changes unauthorized `/uploads/:id{,/download}` from `200` to `403` and student `POST /credits` purchase from `201` to `403` in API mode; Phase 03 adds password change/reset routes; Phase 04 adds Curriculum Library endpoints and optional `libraryItemIds` on lessons).
- Demo mode (`NEXT_PUBLIC_DEMO_MODE !== "false"`) remains fully offline with zero `/api/v1/` calls.

---

## Blast Radius

Full phase-by-phase ownership and overlap rules are maintained in:
- `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-blast-radius-registry.md`

---

## Verification Evidence

```powershell
# Baseline repo + harness validators (Phase 0)
node .claude/skills/vc-generate-phase-program/scripts/validate-umbrella-artifact.mjs process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md
node .claude/skills/vc-generate-phase-program/scripts/validate-phase-stub.mjs process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-01-dev-db-migration-0004_PLAN_23-11-26.md
node .claude/skills/vc-audit-plans/scripts/validate-plan-inventory.mjs
node .claude/skills/vc-audit-context/scripts/validate-context-discovery.mjs
node .claude/skills/vc-generate-context/scripts/validate-all-context.mjs
# Expected: 0 failures on umbrella, all 6 phase stubs, plan inventory, and all-context
```

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md`
- Last completed phase: Phase 05 (Parity Polish & Frontend Unit Tests), 25-11-26
- Validate-contract status: Phase 01 PASS, Phase 02 PASS, Phase 03 PASS; Phase 04 PASS; Phase 05 PASS
- Next step for a fresh agent: Read this umbrella plan and `account-invites_REPORT_25-11-26.md`, then handle the user's three follow-ups before Phase 06 (manager edit 403, public self-register decision, per-sender invite limit; backlog notes in `process/features/launch-readiness/backlog/`), each as its own RIPER-5 pass starting with RESEARCH. Then Phase 06 Step 1 RESEARCH.
- Current phase: between Phase 05 and Phase 06 (account-invites fix done with gaps; three follow-ups pending)
- Next action: RESEARCH for the manager-edit-team-member-403 follow-up (vc-research-agent)
- Execute-agent start instruction: Do NOT enter EXECUTE for any follow-up or Phase 06 until their PVL validate-contracts and explicit user approval are complete. Step F (first real SMTP send) never runs without the user's explicit OK.

---

## Current Execution State

Last updated: 26-11-26
Current phase: 5 of 6 closed (Phase 05 done; the account-invites fix is done with gaps; three follow-ups, then Phase 06)
Phase 5 name: Parity Polish & Frontend Unit Tests
Phase 5 status: ✅ VERIFIED — review decision approved (user, 25-11-26); execution commit 5c1b4b9; no open acceptance gaps (the API-mode 390px visual probe and Phase 03 P3-13 passed); residuals are low and tracked in backlog `phase-05-review-residuals_NOTE_25-11-26.md`
Phase 5 EVL: green 25-11-26 (independent vc-tester, first try: typecheck, lint, backend vitest 7/61, frontend vitest 10/54, root test, smoke 16 domains/705 checks (rebook 64), e2e 27 API + 4 demo, git diff --check, backend/src/db clean, lockfile only the vitest line, npm ci + typecheck + frontend tests); results.tsv rows 7-9 HALTED_SUCCESS
Phase 5 report: process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-05-parity-polish-and-unit-tests_REPORT_23-11-26.md
Pre-06 fix status: account-invites — VERIFIED (with gaps) 26-11-26. Execution commit 1940ea6; independent EVL #1 and #2 green (backend vitest 12/98, frontend vitest 11/62, smoke 17 domains/835, e2e 30 API + 5 demo); review approved-with-concerns (user, 26-11-26). Step F (first real SMTP send, AC-19) is pending the user, so the task folder stays in active/. Plan: process/features/launch-readiness/active/account-invites_25-11-26/account-invites_PLAN_25-11-26.md; report: account-invites_REPORT_25-11-26.md in the same folder.
Next phase: the user's three follow-ups before Phase 06, each its own RIPER-5 pass: (1) manager-edit-team-member-403, (2) public-self-register-decision, (3) per-sender-invite-limit (backlog notes in process/features/launch-readiness/backlog/). Then Phase 06 — CI & Docker Compose (process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-06-ci-and-docker-compose_PLAN_23-11-26.md)
Current loop step: between phases (follow-up 1 RESEARCH, then Phase 06 Step 1 RESEARCH)
Validate-contract status: Phase 01 PASS; Phase 02 PASS; Phase 03 PASS; Phase 04 PASS (Step F supplement PASS); Phase 05 PASS (inner PVL, 24-11-26); Phase 06 pending
Program Net Gate: IN_PROGRESS
Latest validator run: 26-11-26 — account-invites EVL #2 all green on default lumina (smoke 17/17 835 checks, e2e 30 API + 5 demo, backend vitest 98, frontend vitest 62; migration 0007 applied, next free 0008)
Carry-ins for later phases: Phase 06 prerequisites from account-invites (production MAIL_* and APP_URL in compose and README; never run db:seed in production; first-admin bootstrap, backlog production-first-admin-bootstrap_NOTE_25-11-26.md; CI keeps MAIL_MAILER unset or log); Step F real SMTP send pending the user (backlog account-invites-real-smtp-verification_NOTE_25-11-26.md); Phase 06 — trust-proxy, NODE_ENV/limiter-cap, sameSite, e2e webServer startup timeout flake (deferred from Phases 04 and 05), vitest specifier alignment (frontend 3.2.7 vs backend ^3.0.5) alongside the lockfile and `npm ci` CI work (see Phase 06 plan "Carried in" and backlog `phase-05-review-residuals_NOTE_25-11-26.md`); unscheduled backlog — frontend createLibraryItem unit test, upload write-path hardening, POST /requests attachment ownership, orphaned uploads, lesson-plan-attach items 2-4 (the suspect storage_key row was inspected and kept by user decision 25-11-26)

Loop step values: RESEARCH | INNOVATE | PLAN-SUPPLEMENT | PVL | EXECUTE | EVL | UPDATE-PROCESS
Orchestrator rule: read "Current loop step" and "validate-contract status" before spawning any subagent. Never spawn execute-agent when loop step is RESEARCH, INNOVATE, PLAN-SUPPLEMENT, or PVL.

Note: The Stable Program Goal above is fixed. This section is the only part that changes — update-process-agent rewrites it after every phase closeout (overwrite, not append — git history is the audit log).

---

## Validate Contract

(placeholder — per-phase validate-contracts live inside each `phase-0N-*_PLAN_23-11-26.md` and are written by vc-validate-agent before each phase's EXECUTE)
