# backend-cutover

<!-- Part of Lumina ESL -->

## Scope

Program to move the Next.js frontend from its local/demo store (browser localStorage, key `lumina-school:v1`) to the Fastify + Postgres API. Every frontend service branches on `isApiDataMode()`: an API branch calling `lib/school/api/*` and a local branch mutating the store. Demo mode stays the default until Step D removes or isolates it. Source of truth for status is `frontend/CUTOVER_PROGRESS.md`; the file-level plan is `frontend/CUTOVER_PLAN.md`.

## Key Source Files

Frontend:
- `frontend/app/lib/school/api/` -- bootstrap, bookings, credits, approvals, homework, teaching, curriculum, school (typed API clients)
- `frontend/app/lib/school/services/result.ts` -- `ServiceResult<T>`, `run()` / `runAsync()` error conversion
- `frontend/app/lib/school/services/common.ts`, `services/index.ts` -- shared service helpers and barrel
- `frontend/app/lib/school/store.ts`, `adapter.ts`, `types.ts` -- external store, API/local data source, shared types (also imported by the backend contract test)
- `frontend/app/lib/auth/mode.ts` -- `isDemoMode()` / `isApiDataMode()`
- `frontend/app/components/LuminaApp.tsx` -- shell: boot, bootstrap hydration, refresh
- `frontend/.env.example` -- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DEMO_MODE`, `NEXT_PUBLIC_DATA_SOURCE`

Backend:
- `backend/src/routes/school.ts` -- role-scoped `GET /api/v1/school/bootstrap`
- `backend/tests/contract.test.ts` -- cross-workspace contract (schema version, collection/settings keys, command routes, 401 without token)
- `backend/src/db/schema.ts`, `backend/src/db/migrations/`

## Planning Docs (stay in place)

- `frontend/CUTOVER_PLAN.md`, `frontend/CUTOVER_PROGRESS.md` (live board and dated verification log)
- `frontend/ADMIN_PLAN.md` (admin/manager product plan, all phases done), `frontend/PROGRESS.md` (app-wide state and verification commands)

## Related Context

- `process/context/auth/all-auth.md` -- demo vs JWT auth mode separation
- `process/context/database/all-database.md` -- schema, migrations, bootstrap shape
- `process/context/uxui/all-uxui.md` -- frontend shell and component conventions
- `process/context/tests/all-tests.md` -- verification gates

## Current Status

Status: in-progress

Board (per `frontend/CUTOVER_PROGRESS.md`): Step A, B0.1-B0.4, B1 (read path), B2 (write path), B3 (domain slices, `npm run smoke`, parity fixes; archived in `completed/b3-domain-smoke_18-11-26/`) done. Step C (uploads + notifications) is next; Step D (parity + removal) not started. B3 follow-ups are in `backlog/` (booking concurrency, booking rules, credit wording, rebook enrichment, frontend test runner, smoke CI/fixtures). Much cutover work is still uncommitted on `developing` until the B3 commit lands.

Rule: update `frontend/CUTOVER_PROGRESS.md` (board row, checklist, verification log, change log) whenever a slice lands.

## Risks

- Auth mode leakage: keep `NEXT_PUBLIC_DEMO_MODE` strictly separate from real JWT/API auth so mock data never reaches production API calls. Demo is the default unless the flag is `"false"`.
- Dual-path drift: a change to one service branch (API or local) usually needs mirroring in the other until Step D.
- Contract drift: `frontend/app/lib/school/types.ts` and `backend/src/routes/school.ts` must stay in sync; `contract.test.ts` guards keys and routes only.
- Migrations: Drizzle migrations in `backend/` must stay synced with `schema.ts` and API types. `npm run db:reset` truncates all tables; never use it as a gate.
- Test gap: no frontend tests; authenticated business rules are only manually smoked.

## Folder Contents

```
process/features/backend-cutover/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
