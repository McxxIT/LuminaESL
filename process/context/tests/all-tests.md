---
name: context:all-tests
description: "Test and verification guide: backend vitest, browser parity suite (`npm run e2e`), per-domain API smoke, gates, and known gaps"
keywords: tests, testing, vitest, smoke, verification, gates, typecheck, lint, contract test, browser check, debugging failures
related: [context:all-context, context:all-auth]
metadata:
  read_when: testing, verification gates, or debugging runtime failures
date: 24-11-26
---

# lumina-esl - All Tests

Last updated: 2026-11-26

Attach this file first when the task involves testing, verification, or test debugging.

**BLUF:** The backend has automated tests (vitest, 111 tests, 13 files, no DB needed). The frontend has a
Vitest unit runner (87 tests, 14 files, no DB or browser) and a committed browser parity suite (`@playwright/test`, 41 tests: 33 API mode + 6 demo) run by
`npm run e2e`. `npm run smoke` is a separate hybrid per-domain API smoke. There is no CI; authenticated business rules outside the parity suite are verified by
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
| Frontend components, hooks, services | `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/frontend`, then `npm run e2e` (both modes) |
| Booking, credits, refunds, approvals, homework, uploads, notifications | `npm run e2e` (API suite asserts credit deltas, lesson/request status, byte parity, read/mute state) |
| Drizzle schema | `npm run db:generate`, review SQL, `npm run db:migrate` on a local DB, typecheck |

Vitest covers `backend/src` and the frontend local-branch services (`frontend/tests`); `@playwright/test` covers
the browser in both data modes. There is no jest and no CI.

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
| root | `npm run test` | No | Runs all workspaces `--if-present`; backend and frontend both have a test script |
| root | `npm run typecheck` | No | Frontend runs `next typegen && tsc --noEmit` |
| root | `npm run lint` | No | Both workspaces |
| root | `npm run build` | No | Frontend `next build`; backend `tsc --noEmit` (no emitted build) |
| root | `npm run dev` | Yes (backend) | web + api via concurrently |
| backend | `npm run test --workspace @lumina/backend` | No | `vitest run` |
| backend | `npm run test:watch --workspace @lumina/backend` | No | watch mode |
| frontend | `npm run test --workspace @lumina/frontend` | No | `vitest run`: 14 files / 87 tests in `frontend/tests/` (node env, `@` alias, `helpers/{school,fixtures}.ts` build a seeded memory store); covers credits, bookings and rebook, approvals, homework, quality, notifications, permissions, library guards, upload validation, the manager team-edit rules (`people-edit-rules.test.ts`, `people-api-guard.test.ts`, `people-api-edit.test.ts`), and `credit-copy.test.ts` (guards "hours" wording in a fixed file list; extend it with new screens) |
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

## Per-Test-File Coverage (backend/tests, 111 tests in 13 files)

| File | Tests | Covers |
|---|---|---|
| `app.test.ts` | 4 | `/health` 200; unknown route 404 `NOT_FOUND`; `/api/v1/lessons` without token 401; bad login body 400 `VALIDATION_ERROR` |
| `contract.test.ts` | 10 | Cross-workspace contract: `SCHOOL_SCHEMA_VERSION` match; `BOOTSTRAP_COLLECTION_KEYS` and settings keys match `SchoolCollections`/`SchoolSettings`; `app.hasRoute` for adapter command routes (including `uploads` and `notifications/state`); `/school/bootstrap` 401 without token; notification state + upload routes 401 without token; `POST /credits` 401 anonymous and 403 for a student token (staff-managed policy); change-password and reset-password routes exist and reject anonymous callers; `PATCH /users/:id` exists and answers 401 anonymously; the 4 library routes exist and reject anonymous callers; bootstrap collection keys total 18 |
| `password.test.ts` | 6 | scrypt hash/verify, salted uniqueness, `addMinutes` midnight wrap; password policy (min 10, max 128, new != current, strict reset schema) |
| `db-types.test.ts` | 6 | DB-free: postgres `numeric` (OID 1700) parser registration and parsing; `RATE_LIMIT_MAX` env default 300; `AUTH_RATE_LIMIT_MAX` default 30; production `CORS_ORIGIN` guard rejects `*`, empty, and non-http(s) |
| `auth-lifecycle.test.ts` | 6 | DB-free: `refreshCookieOptions` (`secure` only in production); total limiter key generators; 429 after `AUTH_RATE_LIMIT_MAX` with per-email buckets and per-IP ceiling; change-password keyed by `user.sub`; refresh limited by cookie |
| `school-import.test.ts` | 13 | D2 one-time import: zod payload and pure `buildImportPlan` |
| `upload-path.test.ts` | 17 | DB-free: `resolveUploadPath` containment (traversal, absolute paths, NUL, `:` drive letters and alternate data streams, the upload directory itself), with Windows path semantics injected so they run on any OS |
| `invites.test.ts` | new | DB-free: token generation/hash (sha256-only), invite lifecycle helpers, spy-logger assertion that tokens and links are never logged |
| `mailer.test.ts`, `invite-email.test.ts`, `env-mail.test.ts` | new | Mailer modes (smtp/log/array, smtp refused under `NODE_ENV=test`), email content, mail env parsing and the production mail guard |
| `seed-guard.test.ts` | new | `assertSeedAllowed` refuses `NODE_ENV=production` |
| `user-edit-policy.test.ts` | 12 | DB-free policy for the manager team-edit path: `userPatchAccess` matrix (admin any key set, manager name + active/paused only, restricted keys and archive denied, self rules kept, teacher/student non-self denied, empty parsed key set), `planUserPatchEffects` (effective email change, revoke/expire/reinvite flags, paused/archived/invited cases) and `emailChangeSummary` (never contains an address) |

(`password.test.ts`, `school-import.test.ts`, `contract.test.ts`, `db-types.test.ts` were extended: unusable-hash helpers, invited import status, new routes, production mail keys.) Per-file counts for the new files are not itemised; the total is 111 tests in 13 files.

(`app.test.ts` and `contract.test.ts` hardcode an Env that includes `RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_MAX`. `backend/scripts/` is excluded from `npm test`.)

## Smoke Gate (`npm run smoke`)

- Command: `npm run smoke` (root alias of `npm run smoke --workspace @lumina/backend`; `backend/scripts/smoke.ts`). Needs local Postgres and the backend env file; about 1 minute.
- Starts a temporary backend on `127.0.0.1:4100` (`SMOKE_PORT`), creates its own fixtures (`smoke-{runId}-*@smoke.lumina.test`), and checks 18 domains (settings, slots, booking, on-behalf, rebook, lessons, requests, credits, refunds, homework, quality, profile, uploads, notifications, auth, library, invites, team-edits): allowed role OK, denied roles 403, cross-team manager 403, exact credit deltas, exactly one activity row per mutation, refund evidence on uncharged/reversed/charged lessons, upload 5 MB/MIME rules plus the full attachment access matrix (pre-attach uploader/admin 200, cross-team/student 403; published plan enrolled roles 200, unrelated 403; draft course owner/admin 200, others 403; request evidence target teacher/manager 200, cross-team/student 403), staff-managed credits (student self-purchase 403 with unchanged balance, admin purchase 201, 101 still 400), notification feed scoping and state roundtrip, and the `auth` domain (58 checks on a dedicated fixture user: change-password happy path with cookie rotation, wrong current -> 400 `INVALID_CURRENT_PASSWORD`, other devices' refresh 401 while the current device's new cookie refreshes, admin reset 200 without echoing the password, self-reset 400, non-admin 403, unknown 404, extra fields 400, pause/archive revoke refresh, prune keeps fresh and 1-day-old revoked rows and deletes expired and 8-day-old revoked rows). 1060 checks per run (uploads 61, library 170, credits 68, auth 58, rebook 64, invites 130, team-edits 224); last green: 2026-11-26. The `team-edits` domain (manager-team-edits fix) creates `smoke-{runId}-te*` fixtures through the existing create/invite helpers: manager rename of an own-team teacher and student plus an enrolled-only student, byte-identical 403 scope checks, restricted-key denies with no partial write, archived-target denies, pause/reactivate with refresh revocation, admin email change on active (revoke) and invited (old link dead, one open invite, one mail to the new address, cooldown bypass, failNext committed), duplicate/race 409s, and activity summaries scanned for `@`. The `invites` domain (account-invites fix) uses an injected array mailer and `INVITE_RESEND_COOLDOWN_SECONDS=2` (each legitimate resend waits about 2.1 s): admin and manager create + accept, token edge cases (expired, used, unknown) and parallel accept, resend with cooldown and parallel resend, manager create and resend never returning a link, mail failure, admin-only password, status safety (invited cannot log in, reset-password 409), forced profile-insert rollback, and three rounds each of set-password racing resend and PATCH archived (no 500, consistent end state). The `rebook` domain (Phase 05) covers rebook of scheduled, completed and cancelled originals (fresh `ESL-####` room code, next lesson plan distinct from every other active lesson of the student, `planAttachedBy`, enrollment, exactly one credit debit and one `lesson.booked` activity), the 0.5-credit refusal, and a live original returning 400 with the balance unchanged and the slot still open. The room-code inequality check can collide about 1 time in 9000; rerun once before treating it as a defect. The `library` domain (Phase 04) covers staff-only create/edit/archive (creator-or-admin edit), strict bodies and limits, attach/detach on own-team versus other-team lessons, cancelled-lesson and archived-item denial, the attach race (one winner, 409 for the rest), the `canAccessAttachment` library branch (student and teacher on their own non-cancelled lessons, including completed, get 200; other students and unattached published items get 403 for students and teachers), the plan-attach strict `{attachmentId}` contract (uploader or admin; request evidence 422), download containment (a poisoned `storage_key` returns 404), and that the manager bootstrap carries `createdByName` but no other managers' user rows. Smoke archives the library items it creates in `finally`. `loadEnv` sets `AUTH_RATE_LIMIT_MAX=100000`.
- Guards: never resets/pushes/truncates; refuses `NODE_ENV=production`, non-local DB hosts (unless `SMOKE_ALLOW_REMOTE=1`), and port 4000; restores settings in `finally`/SIGINT; archives its users. Fixture rows stay behind in the dev DB (backlog: `smoke-ci-and-fixtures_NOTE_18-11-26.md`).
- Not in CI. Port 4100 must be free. Next 16 allows one dev server per project folder, so browser checks cannot run next to `npm run dev` (use a temporary frontend copy inside the repo root).

## Parity Suite (`frontend/e2e`, 41 tests: 33 API + 6 demo)

- Command: `npm run e2e` (root alias) = `e2e:api` then `e2e:demo`. Needs local Postgres, the backend
  env file, and a seeded DB; ports 3000, 3100, and 4000 must be free (the API config reuses an
  existing backend on 4000 unless `CI` is set, but never reuses an existing frontend on 3000). About
  75 s total; last green: 2026-11-26. `auth.spec.ts` gained two tests (change-password on a disposable manager with wrong-current staying signed in, and the admin `ResetPasswordModal` from the `AdminManagers` card); `manager-team-edits.spec.ts` adds the manager edit/pause path and the admin invited-email change; the demo regression spec asserts the Settings password explainer with no password inputs and zero `/api/v1/` requests. Disposable-account helpers: `createDisposableUser` / `archiveUser` in `frontend/e2e/support/api.ts`.
- Two configs, not two projects: `frontend/playwright.config.ts` runs the app on :3000 with
  `NEXT_PUBLIC_DEMO_MODE=false` + `NEXT_PUBLIC_DATA_SOURCE=api`; `frontend/playwright.demo.config.ts`
  runs it on :3100 with demo defaults and no backend. `e2e/serve.mjs` injects that env and spawns
  `next dev`, because Next inlines `NEXT_PUBLIC_*` when the dev server starts — one server per mode is
  the only honest split. Runs are sequential (`workers: 1`).
- `npm run e2e:demo --workspace @lumina/frontend` needs no Postgres.

| Spec | Tests | Covers |
|---|---|---|
| `e2e/api/auth.spec.ts` | 3 | API login + bootstrap 200; no token/JWT in `localStorage`; wrong password keeps the form; logout then reload does not resume the session |
| `e2e/api/uploads.spec.ts` | 2 | Test 1: `POST /uploads` 201 for a unique PDF, plan row appears, authenticated download returns byte-identical content. Test 2 (Phase 02): unattached manager upload is 200 for uploader/admin and 403 for another manager/student; student `POST /credits` is 403; API-mode Student Billing shows "School-managed credits", no "Buy credits" button, and no demo VISA card |
| `e2e/api/notifications.spec.ts` | 2 | Mark-all-read persists to `/notifications/state` and survives reload; muting a category persists per user; original state restored in `finally` |
| `e2e/api/curriculum-library.spec.ts` | 1 | Phase 04: a manager uploads a PDF, creates a library item, and attaches it to a lesson in the Materials dialog; the student and the teacher of that lesson download byte-identical content; credits restored and created items archived in `finally`. The demo regression spec gained `runs the Curriculum Library locally` (local happy path plus UI negatives: picker excludes archived items, no Materials on cancelled lessons, no teacher attach control) |
| `e2e/api/booking.spec.ts` | 1 | Teacher opens a fresh future slot, student books it, credit balance delta is exactly `-1`, lesson reads `scheduled` for the right teacher; `finally` cancels the lesson (freeing the teacher/date/time key for the next run) and restores the balance so repeat runs never drain the seeded student |
| `e2e/api/booking-collision.spec.ts` | 5 | Occupied-key 409s with no state change: student booking on a reopened slot (balance, lesson count, slot claim unchanged), reschedule onto an occupied time (lesson keeps its old time/status), reactivating a cancelled lesson into an occupied key, two concurrent `POST /lessons` (one 201 + one 409, one active row), and collision vs validation (400 `VALIDATION_ERROR`) vs insufficient credit (400 `BAD_REQUEST`) |
| `e2e/api/cancellation-refund.spec.ts` | 1 | Manager books on behalf, teacher files a cancellation with PNG evidence, manager sees the evidence as a blob URL, approves, credit delta is exactly `+1`, lesson reads `cancelled` |
| `e2e/api/homework.spec.ts` | 1 | Teacher assigns homework, student submits it, teacher reviews it (status `Reviewed`, no Review button left) |
| `e2e/api/cache-keys.spec.ts` | 2 | An API sign-in leaves `lumina-school:v1` byte-identical, caches to `lumina-school:api-cache`, and captures the local school into `lumina-school:pending-import` before the bootstrap (a second boot does not replace it); a UUID-only payload is treated as an API cache, not local data, and is not captured |
| `e2e/api/import.spec.ts` | 2 | Seeds a synthetic local school, previews it (no writes, no marker), imports it, and asserts through `/school/bootstrap`: created student with hex avatar and recorded `createdAt`, lesson `endTime`/`createdAt`/`createdBy`, approved request with its reviewed state and attachment, credit sign/amount, byte-identical attachment download, marker row, `v1` untouched; a repeat is 409 and a forced run is 201. Second test: anonymous 401, manager/teacher/student 403 |
| `e2e/api/no-demo-seed.spec.ts` | 2 | D3: an API account boots over a stale offline cache (no `assignments`) plus a real `lumina-school:v1`; no demo homework/course title renders, the stale marker row is replaced, `v1` stays byte-identical, and no "Reset demo" control exists in admin/student/teacher settings. Second test is a Node store probe: `configureSchoolDataSource("api")` + `resetSchool()` leaves the snapshot untouched and logs the warning |
| `e2e/api/credit-concurrency.spec.ts` | 3 | Ledger serialization, API-only (no UI): two concurrent `POST /bookings` on a 1-credit balance -> exactly one 201 + one 422, balance 0, one lesson; two concurrent student cancels -> one 200 `refunded:true` + one 409, +1 once; two concurrent absences -> one 201 + one 409, one refund. `freeTime()` skips both open slots and keys with an active lesson; `finally` restores the balance, closes leftover slots, and cancels the lessons it booked |
| `e2e/api/manager-team-edits.spec.ts` | 3 | Manager edits and pauses/reactivates a team teacher, then a team student (locked Email with `email-locked-note`, `PATCH /users/:id` body carries only `["name"]`, status polled through the admin bootstrap); an admin changing an invited teacher's email sees the invite-result modal and the old link is dead. Fixtures via `apiPost('/users', adminToken, ...)`, `archiveUser` in `finally` |
| `e2e/demo/regression.spec.ts` | 6 | Demo login with any password, local snapshot present, IndexedDB upload + byte-identical download, bell read state and mute survive reload, zero `/api/v1/` requests; an older local snapshot still gains the seeded `assignments`; Settings still resets the demo school and re-seeds `v1`; invitation links are ignored with no invite controls; a demo manager edits a team member with the Email locked and the admin-only note |

- Safety: the suite never migrates, seeds, resets, truncates, or pushes. `e2e/support/preconditions.ts`
  verifies `/health`, the seeded admin login, the four seeded accounts, and a non-empty lesson
  collection, then fails loudly with the command a human should run (probe: point `E2E_API_URL` at a
  dead port and the `beforeAll` fails every test in the file).
- Residue per run (unavoidable without a disposable DB): one uploaded plan file per upload spec (plus
  one unattached manager upload from the Phase 02 scoping test), one
  booked-then-cancelled lesson, one booked+cancelled lesson with an approved request, one reviewed
  assignment, `notification_state` churn that is restored, and - from `import.spec.ts` - one imported
  student with profile, a course/unit/plan chain, an enrollment, one completed lesson dated 2031-03-05, an
  approved cancellation request, an uploaded PDF, one `school.imported` marker plus a second marker from
  the forced run. `credit-concurrency.spec.ts` adds probe lessons (two future dates, one past date) and
  restores the ledger with `adjustment` entries; it closes the slot it failed to book and cancels the
  lessons it booked. `booking.spec.ts` and `booking-collision.spec.ts` cancel every lesson they create, so
  no *active* row accumulates at a reused teacher/date/time key (cancelled history rows remain by design).
  `booking.spec.ts` also restores the credit it spends via `setCreditBalance` (`e2e/support/api.ts`), so the
  suite no longer drains the seeded student run over run. Unique `runId` markers keep rows attributable; the
  archived D2 execute report
  (`process/features/backend-cutover/completed/d2-one-time-import_19-11-26/d2-one-time-import_EXECUTE_19-11-26.md`)
  lists the residue. Migrations `0003` (`absences.lesson_id` unique) and `0004`
  (`lessons_active_teacher_date_time_uidx`) are applied on default dev `lumina` (as of Nov 23, 2026), so
  `npm run smoke` and `npm run e2e` run directly against `backend/.env` without overrides.
- Failure artifacts: `frontend/test-results/{api,demo}/<test>/` gets `test-failed-1.png`, `video.webm`,
  `trace.zip` (`npx playwright show-trace <zip>`), and `error-context.md`; the HTML report goes to
  `frontend/playwright-report/`. All three folders are gitignored and excluded from ESLint.
- Backend `webServer` uses `npm run start` (no `--watch`): a `tsx watch` child outlived a failed boot on
  Windows and held port 4000. It also runs with `RATE_LIMIT_MAX=100000` and `AUTH_RATE_LIMIT_MAX=100000` (matching `smoke.ts`; without the auth override login volume hits the 30/min auth limit); at the default
  300/min the suite's own volume rejected later specs with `429` on `/health`. Not in CI — see
  `process/features/backend-cutover/backlog/e2e-ci-wiring_NOTE_18-11-26.md`.

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

- No frontend component tests (the Vitest suite covers services, permissions and copy guards, not rendered screens); browser coverage is the Playwright parity suite (33 API tests
  across auth, uploads, notifications, booking, booking collisions, cancellation/refund, credit races,
  homework, manager team edits, API boot with no demo data, import, and the Curriculum Library, plus 6 demo tests).
- Phase 05 closed the Phase 04 gaps: the library service guards are unit-tested (`frontend/tests/library.test.ts`) and the API-mode visual probe plus Phase 03 P3-13 passed at 390px. Still open: the `createLibraryItem` happy path needs a FileReader/IndexedDB shim (`backlog/frontend-library-create-item-unit-test_NOTE_25-11-26.md`); smoke has no rebook 409 or other-student 403 case (`backlog/phase-05-review-residuals_NOTE_25-11-26.md`); one e2e webServer 240 s startup timeout was seen once in Phase 04 and not reproduced (`backlog/e2e-startup-timeout-flake_NOTE_24-11-26.md`, Phase 06).
- Authenticated business rules not in the parity suite (course ownership, publish/archive, absences,
  ratings) are covered by `npm run smoke` and by hand only (rebook has its own smoke domain).
- Credit races are covered: `e2e/api/credit-concurrency.spec.ts` fires two concurrent bookings, cancels, and
  absences and asserts exactly one winner. The balance read and debit are serialized per student by
  `lockStudentCredits` (advisory transaction lock, Nov 20, 2026). `POST /lessons` debits 1 credit and refunds
  only lessons that still carry a matching `booking` debit for the same student (`isLessonCharged`); plan
  selection is row-locked (`.for("update")`); smoke asserts the debit delta and the uncharged/reversed cases.
- Any new spec that spends credits must restore the balance with `setCreditBalance` in `finally`; the seeded
  student had been drained to 0.25 credits by repeated `booking.spec.ts` runs and was topped back up to 24 on
  20-11-26.
- Active teacher/date/time uniqueness is enforced by `lessons_active_teacher_date_time_uidx` (migration
  `0004`, now applied on default dev `lumina` as of Nov 23, 2026) and proved by `booking-collision.spec.ts`
  (five cases) plus a DB duplicate query after each run. Any new spec must still avoid a teacher/date/time
  that already has an active lesson, and cancel what it books in `finally`.
- No CI; backend "build" is typecheck only. The parity suite has no CI job either
  (backlog: `e2e-ci-wiring_NOTE_18-11-26.md` — needs a Postgres service, `db:migrate`, `db:seed`).
- The parity suite runs against a shared database and leaves fixture rows behind by design; until a
  disposable test database exists, residue is documented rather than cleaned. Today the nearest thing is
  `lumina_review`, a disposable clone used for migration and collision work.

## Last Verified Test Run

2026-11-26 (manager-team-edits, pre-Phase-06 fix, executor run plus independent vc-tester EVL, then the review follow-up fix; default `backend/.env`): `npm run typecheck` and `npm run lint` exit 0; backend vitest 13 files / 111 tests; frontend vitest 14 files / 87 tests (after the N1/N2 follow-up); `npm run smoke` 18/18 domains, 1060 checks (team-edits 224, profile 19, invites 131, auth 58); `npm run e2e` 33 API + 6 demo with ports 3000/3100/4000 verified free first; `git diff --check` clean; `git status --porcelain -- backend/src/db` empty; dependency diff empty; logging grep 0 matches. The follow-up re-ran typecheck, lint, frontend vitest and e2e only (no backend file changed).

2026-11-25 (Phase 05 Parity Polish and Unit Tests, independent vc-tester EVL, default `backend/.env`): `npm run typecheck` and `npm run lint` exit 0; `npm run test --workspace @lumina/backend`: 7 files, 61 tests; `npm run test --workspace @lumina/frontend`: 10 files, 54 tests; `npm run smoke`: 16/16 domains, 705 checks (rebook 64), exit 0; `npm run e2e`: 27/27 API + 4/4 demo with no startup timeout; `git diff --check` clean; `git status --porcelain -- backend/src/db` empty; `npm ci` then typecheck and frontend tests green.

Previous: 2026-11-24 (Phase 04 Curriculum Library, independent vc-tester EVL #2 after the Step F review fixes, default `backend/.env`): `npm run db:migrate` no-op (`0005`, `0006` applied; `0005` hash unchanged); `npm run typecheck` and `npm run lint` exit 0; `npm run test --workspace @lumina/backend`: 7 files, 61 tests passed; `npm run smoke`: 16/16 domains, 656 checks (uploads 61, library 170, credits 68, auth 58), exit 0; `npm run e2e`: 27/27 API + 4/4 demo; `git diff --check` clean. One e2e webServer startup timeout (240 s) was seen once during execute and passed on rerun.

2026-11-24 (Phase 03 auth lifecycle hardening, independent vc-tester EVL, default `backend/.env`): `npm run typecheck` and `npm run lint` exit 0; `npm run test --workspace @lumina/backend`: 6 files, 43 tests passed; `npm run smoke`: 15/15 domains, 463 checks (auth 58), exit 0; `npm run e2e`: 26/26 API + 3/3 demo, no 429; `git status --porcelain -- backend/src/db` empty. Known gap: the agent-probe visual check of `PasswordChangeCard` / `ResetPasswordModal` at 390px was not run. Limiter behavior at the real default (30/min) is proven by vitest only.

2026-11-23 (Phase 02 security & staff-managed credits, default `backend/.env` with no overrides):
`npm run typecheck` and `npm run lint` exit 0; `npm run test --workspace @lumina/backend`: 5 files, 31
tests passed; `npm run smoke`: 14/14 domains, 405 checks, settings restored, exit 0; `npm run e2e`: 24/24
API + 3/3 demo passed; post-run DB check: 0 active duplicate groups.

2026-11-23 (Phase 01 dev `lumina` migration `0004` alignment, default `backend/.env` with no overrides):
`npm run db:migrate` (5 migrations, `lessons_active_teacher_date_time_uidx` live on `lumina`),
`npm run typecheck` and `npm run lint` exit 0; `npm run test --workspace @lumina/backend`: 5 files, 30
tests passed; `npm run smoke`: 14/14 domains, 375 checks, settings restored, exit 0; `npm run e2e`: 23/23
API + 3/3 demo passed; post-run DB check: 0 active duplicate groups.

2026-11-23 (booking collision + refund policy, on the disposable `lumina_review` database): `npm run
typecheck` and `npm run lint` exit 0; `npm run test --workspace @lumina/backend`: 5 files, 30 tests passed;
`npm run smoke`: 14/14 domains, 375 checks, settings restored, exit 0; `npm run e2e:api` 23/23 twice back
to back (no cleanup between runs); `npm run e2e:demo` 3/3; `git diff --check` exit 0. DB check after both
runs: 0 active duplicate groups. Migration `0004` applied to `lumina_review` only; dev `lumina` untouched.

2026-11-20 (D3 closeout): `npm run e2e` twice back to back on the final code: run 1 API 15/15 (58.0 s) +
demo 3/3 (13.5 s), run 2 API 15/15 (53.9 s) + demo 3/3 (11.8 s), exit 0 both times, no cleanup between
runs. `npm run typecheck` and `npm run lint` exit 0; `npm run test --workspace @lumina/backend`: 5 files,
30 tests passed; `npm run smoke`: 13/13 domains, 353 checks, settings restored, exit 0; `git diff
--check` exit 0.

2026-11-18 (D1): `npm run e2e` twice back to back: API 9/9 (41.0 s, then 40.6 s) + demo 1/1 (10.0 s each),
exit 0 both times, no leftover node processes or bound ports afterwards. Same day: deliberate red run
(screenshot/video/trace written, exit 1, reverted); precondition probe against a dead API base failed
every test in the file with an actionable message and repaired nothing; `npm run test --workspace
@lumina/backend`: 4 files, 17 tests passed; `npm run smoke`: 13/13 domains, 343 checks, exit 0 (plus a
deliberate red run that exited 1).

## Mail Harness Guards (account-invites fix)

- Tests never send real mail. Smoke injects an array mailer and sets `MAIL_MAILER=array` with `NODE_ENV=test` (startup assertion); the Playwright backend runs `MAIL_MAILER=log`, `NODE_ENV=development`, `INVITE_RESEND_COOLDOWN_SECONDS=0`. `smtp` is refused under `NODE_ENV=test`, and CI must keep `MAIL_MAILER` unset or `log`.
- Check ports 3000, 3100, and 4000 are free before `npm run e2e` (`netstat -ano | findstr ":3000 :3100 :4000"`).
- A combined run (typecheck/lint in parallel with vitest) once timed out `beforeAll` hooks in app/contract/auth-lifecycle; isolated runs were green. Do not run them concurrently.
- Real SMTP delivery (AC-19) was verified manually on 26-11-26 (user-gated Step F, passed): automated gates never send real mail, so a future change to the mail transport needs another user-approved manual send.

2026-11-26 (account-invites fix, independent vc-tester EVL after review fix cycle 1, default `backend/.env`): `npm run db:migrate` no-op (`0007` applied); `npm run typecheck` and `npm run lint` exit 0; backend vitest 12 files / 98 tests; frontend vitest 11 files / 62 tests; `npm run smoke` 17/17 domains, 835 checks (invites 130, no 500s); `npm run e2e` 30 API + 5 demo; `git diff --check` clean; literal-removal and logging gates clean; `npm ci` + typecheck with a lockfile diff of only nodemailer.
