# Phase Blast Radius Registry — `lumina-v1-finish`

Umbrella plan: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md`

| Phase | Primary Owned Surfaces | Shared / Regression-Sensitive Surfaces | Migration? |
|---|---|---|---|
| **01 — Dev DB Migration 0004 Alignment** | Local PostgreSQL `lumina` DB (backup + approved cleanup + `0004`), `process/context/{all-context.md,database/*,tests/all-tests.md}`, `booking-credit-concurrency_NOTE_18-11-26.md` | Existing `smoke` (14/14) & `e2e` (23 API + 3 demo) suites | Applies existing `0004` |
| **02 — Security & Staff-Managed Credits** | `backend/src/routes/{uploads,credits}.ts`, `backend/src/lib/scope.ts`, `frontend/app/components/student/StudentBilling.tsx`, `frontend/app/lib/school/services/credits.ts` | `backend/scripts/smoke.ts`, `backend/tests/contract.test.ts`, `frontend/e2e/api/{uploads,booking,cancellation-refund,credit-concurrency}.spec.ts` | No |
| **03 — Auth & Account Lifecycle Hardening** | `backend/src/routes/{auth,users}.ts`, `backend/src/plugins/auth.ts`, `backend/src/config/env.ts`, `backend/src/app.ts`, `frontend/app/lib/api/auth.ts`, settings password UI | `backend/tests/{app,contract,password}.test.ts`, `frontend/e2e/api/auth.spec.ts`, `frontend/e2e/demo/regression.spec.ts` | Optional (only if password-reset metadata needed) |
| **04 — Curriculum Library** | `backend/src/db/{schema.ts,migrations/0005_*.sql}`, new `backend/src/routes/library.ts`, `frontend/app/lib/school/{types,store,seed,api/library,services/library}.ts`, library UI in manager/teacher/student | `backend/src/routes/{school,lessons,uploads}.ts`, `backend/tests/contract.test.ts`, `backend/scripts/smoke.ts`, `frontend/e2e/api/*`, `frontend/e2e/demo/regression.spec.ts` | Yes (`0005`) |
| **05 — Parity Polish & Frontend Unit Tests** | `frontend/vitest.config.ts`, `frontend/tests/*`, `frontend/package.json`, `frontend/app/globals.css`, `frontend/app/lib/data.ts`, visible "credits" copy across role screens, rebook path in `backend/src/routes/lessons.ts` | `backend/scripts/smoke.ts`, `frontend/e2e/api/*`, `frontend/e2e/demo/regression.spec.ts` | No |
| **06 — CI & Docker Compose Packaging** | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.github/workflows/ci.yml`, `README.md`, `backend/src/app.ts` (`/health/ready` if added) | All workspace scripts in root `package.json`, `frontend/playwright.config.ts`, `backend/scripts/smoke.ts` | No |

## Coordination Rules

1. Phases execute strictly sequentially (`01 -> 02 -> 03 -> 04 -> 05 -> 06`); never edit two phases in the same uncommitted worktree.
2. Whenever a later phase touches a shared surface (e.g., `uploads.ts` in Phase 04 after Phase 02, `lessons.ts` in Phase 05 after Phase 04), EVL MUST run a targeted regression check on the earlier phase's proving tests.
3. Every schema edit (`schema.ts` in Phase 04) must update generated migrations, bootstrap, `frontend/app/lib/school/types.ts`, and `backend/tests/contract.test.ts` in the same phase.
