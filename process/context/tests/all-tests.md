---
name: context:all-tests
description: "Test and verification guide: backend vitest, browser parity suite (`npm run e2e`), per-domain API smoke, gates, and known gaps"
keywords: tests, testing, vitest, smoke, verification, gates, typecheck, lint, contract test, browser check, debugging failures
related: [context:all-context, context:all-auth]
metadata:
  read_when: testing, verification gates, or debugging runtime failures
date: 18-11-26
---

# lumina-esl - All Tests

Last updated: 2026-11-18

Attach this file first when the task involves testing, verification, or test debugging.

**BLUF:** The backend has automated tests (vitest, 30 tests, 5 files, no DB needed). The frontend has a
committed browser parity suite (`@playwright/test`, 14 tests: 13 API mode + 1 demo regression) run by
`npm run e2e`. `npm run smoke` is a separate hybrid per-domain API smoke. There is no frontend
unit/component runner and no CI; authenticated business rules outside the parity suite are verified by
`npm run smoke` or by hand against seeded local Postgres.

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
| Browser parity suite (API + demo) | "Parity Suite" section below (`frontend/e2e`, `npm run e2e`) |

## Quick Decision Guide

| Change is in | Use |
|---|---|
| `backend/src` routes, lib, config, plugins | `npm run test --workspace @lumina/backend` + typecheck + lint |
| Shared types in `frontend/app/lib/school/types.ts` | Backend contract test (it imports these types) + both typechecks |
| Frontend components, hooks, services | `npm run typecheck`, `npm run lint`, then `npm run e2e` (both modes) |
| Booking, credits, refunds, approvals, homework, uploads, notifications | `npm run e2e` (API suite asserts credit deltas, lesson/request status, byte parity, read/mute state) |
| Drizzle schema | `npm run db:generate`, review SQL, `npm run db:migrate` on a local DB, typecheck |

Vitest covers `backend/src`; `@playwright/test` covers the browser in both data modes. There is no
jest, no frontend unit runner, and no CI.

## Default Verification Order

1. `npm run typecheck` (both workspaces)
2. `npm run lint`
3. `npm run test --workspace @lumina/backend`
4. `git diff --check`
5. For UI or behavior changes: `npm run e2e` (needs seeded Postgres; ~1 min)
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
| backend | `npm run lint --workspace @lumina/backend` | No | `eslint src tests scripts` |
| frontend | `npm run typecheck --workspace @lumina/frontend` | No | |
| frontend | `npm run lint --workspace @lumina/frontend` | No | next core-web-vitals + typescript; ignores Playwright output |
| root | `npm run e2e` | Yes | API suite (:3000 + backend :4000), then demo (:3100); sequential |
| frontend | `npm run e2e:api --workspace @lumina/frontend` | Yes | `playwright test --config playwright.config.ts` |
| frontend | `npm run e2e:demo --workspace @lumina/frontend` | No backend | `playwright test --config playwright.demo.config.ts` |
| root | `npm run db:migrate` | Yes | Applies Drizzle migrations |
| root | `npm run db:seed` | Yes | Demo data |
| root | `npm run db:reset` | Yes | DESTRUCTIVE: truncates all tables. Never a gate |

Single file: `npm run test --workspace @lumina/backend -- tests/app.test.ts`.

## 4-Tier Map

| Tier | What | Exact commands |
|---|---|---|
| Fully-automated | No DB, no `.env`, no browser | `npm run typecheck`; `npm run lint`; `npm run test --workspace @lumina/backend`; `git diff --check`; optional `npm run build` |
| Hybrid | Needs local Postgres + `backend/.env` | `npm run smoke` (see Smoke Gate below); `npm run db:migrate`; `npm run db:seed`; `npm run e2e` (see Parity Suite below); API smoke: login and `GET /api/v1/auth/me` for the 5 demo accounts, `GET /api/v1/school/bootstrap` |
| Agent-probe | Agent drives or inspects a running stack | Use `vc-agent-browser` against `npm run dev` (demo mode is default; API mode needs `NEXT_PUBLIC_DEMO_MODE=false` + `NEXT_PUBLIC_DATA_SOURCE=api`); curl smoke against the seeded API; one-off investigations the suite does not cover |
| Known-gap | Not verified automatically | See Known Gaps below |

## Per-Test-File Coverage (backend/tests, 17 tests)

| File | Tests | Covers |
|---|---|---|
| `app.test.ts` | 4 | `/health` 200; unknown route 404 `NOT_FOUND`; `/api/v1/lessons` without token 401; bad login body 400 `VALIDATION_ERROR` |
| `contract.test.ts` | 6 | Cross-workspace contract: `SCHOOL_SCHEMA_VERSION` match; `BOOTSTRAP_COLLECTION_KEYS` and settings keys match `SchoolCollections`/`SchoolSettings`; `app.hasRoute` for adapter command routes (including `uploads` and `notifications/state`); `/school/bootstrap` 401 without token; notification state + upload routes 401 without token |
| `password.test.ts` | 3 | scrypt hash/verify, salted uniqueness, `addMinutes` midnight wrap |
| `db-types.test.ts` | 4 | DB-free: postgres `numeric` (OID 1700) parser registration and parsing; `RATE_LIMIT_MAX` env default 300 |

(`app.test.ts` and `contract.test.ts` hardcode an Env that includes `RATE_LIMIT_MAX`. `backend/scripts/` is excluded from `npm test`.)

## Smoke Gate (`npm run smoke`)

- Command: `npm run smoke` (root alias of `npm run smoke --workspace @lumina/backend`; `backend/scripts/smoke.ts`). Needs local Postgres and the backend env file; about 1 minute.
- Starts a temporary backend on `127.0.0.1:4100` (`SMOKE_PORT`), creates its own fixtures (`smoke-{runId}-*@smoke.lumina.test`), and checks 13 domains (settings, slots, booking, on-behalf, rebook, lessons, requests, credits, homework, quality, profile, uploads, notifications): allowed role OK, denied roles 403, cross-team manager 403, exact credit deltas, exactly one activity row per mutation, upload 5 MB/MIME rules, notification feed scoping and state roundtrip. 343 checks per run; last green: 2026-11-18.
- Guards: never resets/pushes/truncates; refuses `NODE_ENV=production`, non-local DB hosts (unless `SMOKE_ALLOW_REMOTE=1`), and port 4000; restores settings in `finally`/SIGINT; archives its users. Fixture rows stay behind in the dev DB (backlog: `smoke-ci-and-fixtures_NOTE_18-11-26.md`).
- Not in CI. Port 4100 must be free. Next 16 allows one dev server per project folder, so browser checks cannot run next to `npm run dev` (use a temporary frontend copy inside the repo root).

## Parity Suite (`frontend/e2e`, 14 tests)

- Command: `npm run e2e` (root alias) = `e2e:api` then `e2e:demo`. Needs local Postgres, the backend
  env file, and a seeded DB; ports 3000, 3100, and 4000 must be free (the API config reuses an
  existing backend on 4000 unless `CI` is set). About 70 s total; last green: 2026-11-19, twice back
  to back.
- Two configs, not two projects: `frontend/playwright.config.ts` runs the app on :3000 with
  `NEXT_PUBLIC_DEMO_MODE=false` + `NEXT_PUBLIC_DATA_SOURCE=api`; `frontend/playwright.demo.config.ts`
  runs it on :3100 with demo defaults and no backend. `e2e/serve.mjs` injects that env and spawns
  `next dev`, because Next inlines `NEXT_PUBLIC_*` when the dev server starts — one server per mode is
  the only honest split. Runs are sequential (`workers: 1`).
- `npm run e2e:demo --workspace @lumina/frontend` needs no Postgres.

| Spec | Tests | Covers |
|---|---|---|
| `e2e/api/auth.spec.ts` | 3 | API login + bootstrap 200; no token/JWT in `localStorage`; wrong password keeps the form; logout then reload does not resume the session |
| `e2e/api/uploads.spec.ts` | 1 | `POST /uploads` 201 for a unique PDF, plan row appears, authenticated download returns byte-identical content |
| `e2e/api/notifications.spec.ts` | 2 | Mark-all-read persists to `/notifications/state` and survives reload; muting a category persists per user; original state restored in `finally` |
| `e2e/api/booking.spec.ts` | 1 | Teacher opens a fresh future slot, student books it, credit balance delta is exactly `-1`, lesson reads `scheduled` for the right teacher |
| `e2e/api/cancellation-refund.spec.ts` | 1 | Manager books on behalf, teacher files a cancellation with PNG evidence, manager sees the evidence as a blob URL, approves, credit delta is exactly `+1`, lesson reads `cancelled` |
| `e2e/api/homework.spec.ts` | 1 | Teacher assigns homework, student submits it, teacher reviews it (status `Reviewed`, no Review button left) |
| `e2e/api/cache-keys.spec.ts` | 2 | An API sign-in leaves `lumina-school:v1` byte-identical, caches to `lumina-school:api-cache`, and captures the local school into `lumina-school:pending-import` before the bootstrap (a second boot does not replace it); a UUID-only payload is treated as an API cache, not local data, and is not captured |
| `e2e/api/import.spec.ts` | 2 | Seeds a synthetic local school, previews it (no writes, no marker), imports it, and asserts through `/school/bootstrap`: created student with hex avatar and recorded `createdAt`, lesson `endTime`/`createdAt`/`createdBy`, approved request with its reviewed state and attachment, credit sign/amount, byte-identical attachment download, marker row, `v1` untouched; a repeat is 409 and a forced run is 201. Second test: anonymous 401, manager/teacher/student 403 |
| `e2e/demo/regression.spec.ts` | 1 | Demo login with any password, local snapshot present, IndexedDB upload + byte-identical download, bell read state and mute survive reload, zero `/api/v1/` requests |

- Safety: the suite never migrates, seeds, resets, truncates, or pushes. `e2e/support/preconditions.ts`
  verifies `/health`, the seeded admin login, the four seeded accounts, and a non-empty lesson
  collection, then fails loudly with the command a human should run (probe: point `E2E_API_URL` at a
  dead port and the `beforeAll` fails every test in the file).
- Residue per run (unavoidable without a disposable DB): one uploaded plan file per upload spec, one
  booked lesson, one booked+cancelled lesson with an approved request, one reviewed assignment,
  `notification_state` churn that is restored, and - from `import.spec.ts` - one imported student with
  profile, a course/unit/plan chain, an enrollment, one completed lesson dated 2031-03-05, an approved
  cancellation request, an uploaded PDF, one `school.imported` marker plus a second marker from the
  forced run. Unique `runId` markers keep rows attributable; the D2 execute report lists the residue.
- Failure artifacts: `frontend/test-results/{api,demo}/<test>/` gets `test-failed-1.png`, `video.webm`,
  `trace.zip` (`npx playwright show-trace <zip>`), and `error-context.md`; the HTML report goes to
  `frontend/playwright-report/`. All three folders are gitignored and excluded from ESLint.
- Backend `webServer` uses `npm run start` (no `--watch`): a `tsx watch` child outlived a failed boot on
  Windows and held port 4000. Not in CI — see `process/features/backend-cutover/backlog/e2e-ci-wiring_NOTE_18-11-26.md`.

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

- No frontend unit or component tests; browser coverage is the Playwright parity suite (10 tests
  across auth, uploads, notifications, booking, cancellation/refund, homework, and demo mode).
- Authenticated business rules not in the parity suite (course ownership, publish/archive, absences,
  ratings, rebook) are covered by `npm run smoke` and by hand only.
- No concurrency test for double-booking; booking balance read and debit are not row-locked, (backlog: `booking-credit-concurrency_NOTE_18-11-26.md`); backend `POST /lessons` does not debit while demo does (smoke asserts current behavior). Observed, not fixed.
- No unique constraint on lessons (teacher, date, time); the slot-row claim is the only guard.
- No CI; backend "build" is typecheck only. The parity suite has no CI job either
  (backlog: `e2e-ci-wiring_NOTE_18-11-26.md` — needs a Postgres service, `db:migrate`, `db:seed`).
- The parity suite runs against the shared dev DB and leaves fixture rows behind by design; until a
  disposable test database exists, residue is documented rather than cleaned.

## Last Verified Test Run

2026-11-18: `npm run e2e` twice back to back: API 9/9 (41.0 s, then 40.6 s) + demo 1/1 (10.0 s each),
exit 0 both times, no leftover node processes or bound ports afterwards. Same day: deliberate red run
(screenshot/video/trace written, exit 1, reverted); precondition probe against a dead API base failed
every test in the file with an actionable message and repaired nothing; `npm run test --workspace
@lumina/backend`: 4 files, 17 tests passed; `npm run smoke`: 13/13 domains, 343 checks, exit 0 (plus a
deliberate red run that exited 1).
