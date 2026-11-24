---
name: plan:lumina-v1-finish-phase-06-ci-and-docker-compose
description: "Lumina ESL v1 Finish — Phase 06: Docker Compose full-stack packaging and GitHub Actions CI pipeline"
date: 23-11-26
metadata:
  node_type: memory
  type: plan
  feature: launch-readiness
  phase: phase-06
---

# Phase 06 — CI & Docker Compose Packaging

**Program:** lumina-v1-finish
**Umbrella plan:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md
**Phase status:** ⏳ PLANNED
**Report destination:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-06-ci-and-docker-compose_REPORT_23-11-26.md (flat in the program task folder)

---

## Purpose

Package Lumina ESL so anyone can boot the full stack cleanly in containers and run the complete verification suite automatically in CI:
1. Add production-ready `backend/Dockerfile`, `frontend/Dockerfile`, `.dockerignore`, and root `docker-compose.yml` running PostgreSQL 17, Fastify API (with `/health` + DB readiness probe, automatic migration command/entrypoint, persistent uploads volume), and Next.js web app in API mode (`NEXT_PUBLIC_DEMO_MODE=false`, `NEXT_PUBLIC_DATA_SOURCE=api`).
2. Add `.github/workflows/ci.yml` running `typecheck`, `lint`, backend + frontend unit tests, Drizzle `db:migrate` + `db:seed`, `npm run smoke`, and `npm run e2e` against a throwaway PostgreSQL 17 service container (closing `e2e-ci-wiring_NOTE_18-11-26.md` and `smoke-ci-and-fixtures_NOTE_18-11-26.md`).
3. Update `README.md` so a clean checkout can be set up and verified from the README alone (local dev or Docker Compose).

---

## Carried in from Phase 03

Pointers only (24-11-26); details live in `process/features/launch-readiness/backlog/`. Resolve or explicitly accept each during Phase 06 PLAN-SUPPLEMENT and PVL:

- `trust-proxy-and-limiter-store_NOTE_24-11-26.md`: `trustProxy: true` is unconditional; decide env-driven `TRUST_PROXY` against the compose topology.
- `auth-rate-limit-config_NOTE_24-11-26.md`: production cap for `AUTH_RATE_LIMIT_MAX` / `RATE_LIMIT_MAX`; assert `NODE_ENV=production` in compose and CI (it gates the CORS guard and the `Secure` cookie); `sameSite: lax` breaks split-origin deploys, so pick same-site or a reverse proxy; `Retry-After` on the ceiling 429.
- `default-account-password_NOTE_24-11-26.md`: HIGH, should-fix before launch and before this phase packages a deployable stack (shared fixed default password for admin-created accounts).
- CI env: smoke and Playwright set `AUTH_RATE_LIMIT_MAX=100000` (`backend/scripts/smoke.ts` `loadEnv`, `frontend/playwright.config.ts` backend env); the workflow must do the same or auth routes return 429.

---

## Entry Gate

- Phases 01–05 all complete and verified (final schema, security, auth, Curriculum Library, polish, and Vitest suites all in place)

---

## Blast Radius

- `backend/src/app.ts` (optional `/health/ready` DB readiness probe)
- `backend/Dockerfile` (new)
- `frontend/Dockerfile` (new)
- `frontend/next.config.ts` (`output: "standalone"` if selected in INNOVATE)
- `docker-compose.yml` (new)
- `.dockerignore` (new)
- `.github/workflows/ci.yml` (new)
- `README.md`

---

## Implementation Checklist

### Step A — Readiness Probe & Docker Compose Packaging

- [ ] A1. Add lightweight DB readiness check (`GET /health/ready`, returns 200 when Postgres answers `SELECT 1`, 503 otherwise) while keeping `GET /health` fast and DB-free for unit tests.
- [ ] A2. Create `backend/Dockerfile`, `frontend/Dockerfile`, `.dockerignore`, and `docker-compose.yml` with Postgres 17 healthcheck, API migration + start, persistent named uploads volume, and frontend wired to API mode (no hardcoded production secrets; env template documented).
- [ ] A3. Verify Docker Compose build/boot locally (if Docker daemon is available) or validate config with `docker compose config` + document environment status honestly in the phase report.

### Step B — GitHub Actions CI Pipeline

- [ ] B1. Create `.github/workflows/ci.yml` with a throwaway Postgres 17 service container: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run db:migrate`, `npm run db:seed`, `npm run smoke`, `npx playwright install --with-deps chromium`, and `CI=1 npm run e2e` with failure artifact upload (`frontend/playwright-report/`, `frontend/test-results/`).
- [ ] B2. Verify workflow YAML syntax, zero `db:reset`/`db:push` calls, writable `UPLOAD_DIR`, and `CI=1` Playwright behavior.

### Step C — README Clean-Checkout Verification & Final Program Closeout

- [ ] C1. Update `README.md` with accurate local quick-start, Docker Compose quick-start, environment variables, and full test gate commands.
- [ ] C2. Run the full local gate suite (`typecheck`, `lint`, `test`, `build`, `smoke`, `e2e`, `git diff --check`) and prepare the final program closeout.

---

## Exit Gate

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run smoke
npm run e2e
git diff --check
# Plus `docker compose config` (and `docker compose up --build` if Docker is installed locally)
# Expected: all exit 0
```

- All checklist items checked
- Full regression check across all v1 surfaces passes
- Phase report written to report destination above; umbrella ready for program-level archive

---

## Blockers That Would Justify BLOCKED Status

- Any of Phases 01–05 not yet verified
- Docker daemon unavailable locally (note: `docker compose config` + static build remain verifiable; live container boot becomes a documented hybrid/known-gap if Docker is not installed on the dev machine)

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC runs once in the outer program loop).

- [ ] 1. RESEARCH — research-agent: inspect `package.json`, `frontend/next.config.ts`, `backend/src/app.ts`, `frontend/playwright.config.ts`, `README.md`, and local Docker availability
- [ ] 2. INNOVATE — innovate-agent: choose Dockerfile build strategy (Next standalone vs workspace build), Compose migration hook, and CI job split; write Decision Summary
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: refine checklist from research (or mark "n/a — research clean")
- [ ] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by)
- [ ] 5. EXECUTE — implement Steps A–C with per-section gates green
- [ ] 6. EVL — all EVL gates + full regression checks green; EVL HANDOFF SUMMARY written
- [ ] 7. UPDATE PROCESS — phase report written, CI backlog notes closed, context & umbrella state updated, full program archived to `completed/`, commits done

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

---

## Touchpoints

- `backend/src/app.ts`, `backend/tests/app.test.ts`
- `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/next.config.ts`, `docker-compose.yml`, `.dockerignore`
- `.github/workflows/ci.yml`
- `README.md`

---

## Public Contracts

- New optional probe `GET /health/ready` (200/503); existing `GET /health` unchanged.
- Existing `npm run dev`, `npm run smoke`, `npm run e2e` local workflows remain unchanged.

---

## Verification Evidence

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run smoke
npm run e2e
git diff --check
# Expected: exit 0
```

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-06-ci-and-docker-compose_PLAN_23-11-26.md`
- Last completed step: not started
- Validate-contract status: pending
- Next step: Wait for Phase 05 exit gate, then start Phase 06 RESEARCH (Step 1).

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
