# lumina-esl - All Tests

Last updated: 2026-11-17

Attach this file first when the task involves testing, verification, or test debugging.

**BLUF:** Only the backend has automated tests (vitest, 16 tests, 4 files, no DB needed). `npm run smoke` is a separate hybrid per-domain API smoke. The frontend has none: verify it with typecheck + lint + build + manual browser check. Authenticated business rules (booking, refunds, approvals) are verified manually against seeded local Postgres.

Do not load the whole `process/context/tests/` folder by default. Start here, then drill down.

## Read This When

- running tests after implementation
- choosing a verification path
- debugging a failing test or gate

## Quick Routing

| If you need... | Read next |
|---|---|
| Deeper test docs | None yet. This file is the whole test guide; add rows here if split later |
| Cutover verification history | `frontend/CUTOVER_PROGRESS.md` (dated verification log) |
| App-wide verification commands | `frontend/PROGRESS.md` ("Verification commands") |
| Mode flags, demo accounts | `process/context/auth/` group (via `all-context.md`) |

## Quick Decision Guide

| Change is in | Use |
|---|---|
| `backend/src` routes, lib, config, plugins | `npm run test --workspace @lumina/backend` + typecheck + lint |
| Shared types in `frontend/app/lib/school/types.ts` | Backend contract test (it imports these types) + both typechecks |
| Frontend components, hooks, services | `npm run typecheck`, `npm run lint`, optionally `npm run build`, then manual browser check (demo mode and API mode) |
| Booking, credits, refunds, approvals, ratings | Hybrid: seeded local Postgres + API smoke + browser check (no automated tests exist) |
| Drizzle schema | `npm run db:generate`, review SQL, `npm run db:migrate` on a local DB, typecheck |

Vitest is the only runner. There is no Playwright, no jest, no frontend runner, no CI.

## Default Verification Order

1. `npm run typecheck` (both workspaces)
2. `npm run lint`
3. `npm run test --workspace @lumina/backend`
4. `git diff --check`
5. For UI or behavior changes: manual browser check, plus API smoke when the API path changed
6. Optional and slower: `npm run build`

## Commands

| Scope | Command | Needs Postgres / `.env`? | Notes |
|---|---|---|---|
| root | `npm run test` | No | Runs all workspaces `--if-present`; only backend has a test script |
| root | `npm run typecheck` | No | Frontend runs `next typegen && tsc --noEmit` |
| root | `npm run lint` | No | Both workspaces |
| root | `npm run build` | No | Frontend `next build`; backend `tsc --noEmit` (no emitted build) |
| root | `npm run dev` | Yes (backend) | web + api via concurrently |
| backend | `npm run test --workspace @lumina/backend` | No | `vitest run` |
| backend | `npm run test:watch --workspace @lumina/backend` | No | watch mode |
| backend | `npm run typecheck --workspace @lumina/backend` | No | `tsc --noEmit` |
| backend | `npm run lint --workspace @lumina/backend` | No | `eslint src tests` |
| frontend | `npm run typecheck --workspace @lumina/frontend` | No | |
| frontend | `npm run lint --workspace @lumina/frontend` | No | next core-web-vitals + typescript |
| root | `npm run db:migrate` | Yes | Applies Drizzle migrations |
| root | `npm run db:seed` | Yes | Demo data |
| root | `npm run db:reset` | Yes | DESTRUCTIVE: truncates all tables. Never a gate |

Single file: `npm run test --workspace @lumina/backend -- tests/app.test.ts`.

## 4-Tier Map

| Tier | What | Exact commands |
|---|---|---|
| Fully-automated | No DB, no `.env`, no browser | `npm run typecheck`; `npm run lint`; `npm run test --workspace @lumina/backend`; `git diff --check`; optional `npm run build` |
| Hybrid | Needs local Postgres + `backend/.env` | `npm run smoke` (see Smoke Gate below); `npm run db:migrate`; `npm run db:seed`; start `npm run dev`; API smoke: login and `GET /api/v1/auth/me` for the 5 demo accounts, `GET /api/v1/school/bootstrap`; browser check in demo mode and API mode |
| Agent-probe | Agent drives or inspects a running stack | Use `vc-agent-browser` against `npm run dev` (demo mode is default; API mode needs `NEXT_PUBLIC_DEMO_MODE=false` + `NEXT_PUBLIC_DATA_SOURCE=api`); curl smoke against the seeded API |
| Known-gap | Not verified automatically | See Known Gaps below |

## Per-Test-File Coverage (backend/tests, 16 tests)

| File | Tests | Covers |
|---|---|---|
| `app.test.ts` | 4 | `/health` 200; unknown route 404 `NOT_FOUND`; `/api/v1/lessons` without token 401; bad login body 400 `VALIDATION_ERROR` |
| `contract.test.ts` | 5 | Cross-workspace contract: `SCHOOL_SCHEMA_VERSION` match; `BOOTSTRAP_COLLECTION_KEYS` and settings keys match `SchoolCollections`/`SchoolSettings`; `app.hasRoute` for adapter command routes; `/school/bootstrap` 401 without token |
| `password.test.ts` | 3 | scrypt hash/verify, salted uniqueness, `addMinutes` midnight wrap |
| `db-types.test.ts` | 4 | DB-free: postgres `numeric` (OID 1700) parser registration and parsing; `RATE_LIMIT_MAX` env default 300 |

(`app.test.ts` and `contract.test.ts` hardcode an Env that includes `RATE_LIMIT_MAX`. `backend/scripts/` is excluded from `npm test`.)

## Smoke Gate (`npm run smoke`)

- Command: `npm run smoke` (root alias of `npm run smoke --workspace @lumina/backend`; `backend/scripts/smoke.ts`). Needs local Postgres and the backend env file; about 1 minute.
- Starts a temporary backend on `127.0.0.1:4100` (`SMOKE_PORT`), creates its own fixtures (`smoke-{runId}-*@smoke.lumina.test`), and checks 11 domains (settings, slots, booking, on-behalf, rebook, lessons, requests, credits, homework, quality, profile): allowed role OK, denied roles 403, cross-team manager 403, exact credit deltas, exactly one activity row per mutation. 306 checks per run; last green: two consecutive runs, 2026-11-18.
- Guards: never resets/pushes/truncates; refuses `NODE_ENV=production`, non-local DB hosts (unless `SMOKE_ALLOW_REMOTE=1`), and port 4000; restores settings in `finally`/SIGINT; archives its users. Fixture rows stay behind in the dev DB (backlog: `smoke-ci-and-fixtures_NOTE_18-11-26.md`).
- Not in CI. Port 4100 must be free. Next 16 allows one dev server per project folder, so browser checks cannot run next to `npm run dev` (use a temporary frontend copy inside the repo root).

## Debugging Quick Reference

- **No DB needed:** tests build the app via `buildApp({env})` and use `app.inject`. The `postgres` driver connects lazily, so no query runs.
- **No `.env` loaded:** `app.test.ts` hardcodes its `Env` (a `lumina_test` DATABASE_URL and a test JWT secret of 32+ chars). Do not rely on `backend/.env` in tests.
- **Contract test imports frontend types:** `contract.test.ts` imports `../../frontend/app/lib/school/types`. Changing `SchoolCollections`, `SchoolSettings`, bootstrap keys, or the schema version in the frontend can fail a backend test (this is the point).
- **Error shape:** `{error:{code,message,details?}}`; ZodError becomes 400 `VALIDATION_ERROR`.
- **`db:reset` is destructive** (truncates all tables, refuses production). Never use it as a gate.
- **Smoke credentials:** demo accounts `admin@`, `manager@`, `manager2@`, `teacher@`, `student@` at `lumina.school`. API mode password `Password123!`; demo UI accepts any non-empty password.
- **Mode flags (frontend):** `isDemoMode()` is true unless `NEXT_PUBLIC_DEMO_MODE === "false"`; `isApiDataMode()` needs `NEXT_PUBLIC_DATA_SOURCE === "api"` and demo off. Demo store is browser localStorage key `lumina-school:v1`; Settings "Reset demo workspace" reseeds it.
- **Services branch twice:** each frontend service has a local and an API branch; verify both modes when changing one.
- **Next 16:** `frontend/AGENTS.md` says to read `node_modules/next/dist/docs/` before writing Next code.

## Known Gaps

- No frontend unit, component, or e2e tests.
- Authenticated business rules (publish, archive, refund, absence, rating) are only manually smoked.
- No concurrency test for double-booking; booking balance read and debit are not row-locked, (backlog: `booking-credit-concurrency_NOTE_18-11-26.md`); backend `POST /lessons` does not debit while demo does (smoke asserts current behavior). Observed, not fixed.
- No unique constraint on lessons (teacher, date, time); the slot-row claim is the only guard.
- No CI; backend "build" is typecheck only.
- Open item: mutation-specific browser/API smoke per migrated domain (cutover step B3).
- Working tree carries much uncommitted cutover work; re-run gates before relying on a baseline.

## Last Verified Test Run

2026-11-18: `npm run test --workspace @lumina/backend`: 4 files, 16 tests passed (independent vc-tester rerun). `npm run smoke` x2: 11/11 domains, 306 checks, exit 0.

---

**Status:** DONE
**Summary:** Populated from study findings; test run confirmed.
