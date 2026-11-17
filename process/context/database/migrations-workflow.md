---
name: context:database-migrations-workflow
description: "Drizzle migration generate/apply workflow and the keep-in-sync checklist (schema, API, frontend types, contract test)"
keywords: migration, drizzle-kit, db:generate, db:migrate, db:push, journal, snapshot, contract test, sync
related: [context:all-database]
date: 17-11-26
---

# Migrations Workflow

BLUF: Edit `backend/src/db/schema.ts`, run `npm run db:generate`, review the SQL, apply with `npm run db:migrate`, then update the API and frontend types. This is a user-flagged care area: migrations, schema, API types, and frontend types must not drift.

## Config and files

- `backend/drizzle.config.ts`: schema `./src/db/schema.ts`, out `./src/db/migrations`, dialect postgresql, `strict: true`; reads `DATABASE_URL` from `backend/.env` via dotenv.
- Migrations: `0000_material_jane_foster.sql` (baseline), `0001_fractional_credit_hours.sql` (`credit_entries.hours` -> `numeric(8,2)`), plus `meta/_journal.json` and snapshots. `_journal.json` is currently modified in the working tree — never hand-edit it.
- Root scripts (run from repo root): `db:generate`, `db:migrate`, `db:push` (dev shortcut, skips migration files — avoid for shared schema work), `db:seed`, `db:reset`, `db:studio`.

## Keep-in-sync checklist (every schema change)

1. `backend/src/db/schema.ts` edited; migration generated and committed (SQL + journal + snapshot together).
2. Route Zod schemas / handlers in `backend/src/routes/*` updated.
3. Bootstrap payload (`backend/src/routes/school.ts`) and frontend `frontend/app/lib/school/types.ts` updated; bump `SCHOOL_SCHEMA_VERSION` if the shape changes.
4. `backend/tests/contract.test.ts` imports the frontend types and compares `BOOTSTRAP_COLLECTION_KEYS` / settings keys / `SCHOOL_SCHEMA_VERSION` — run `npm run test --workspace @lumina/backend`.
5. Local-mode mirror (`frontend/app/lib/school/seed.ts`, `migrate.ts`, services) updated if the shape is shared.
6. `npm run typecheck` across both workspaces.

## Cautions

- Data-changing migrations (type casts like 0001) need a `USING` clause; review generated SQL before applying.
- Never run `db:reset` as a verification gate (see `seed-and-reset.md`).
- No CI/CD exists; verification is local (Postgres + `backend/.env`).
