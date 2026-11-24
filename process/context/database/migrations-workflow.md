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
- Migrations: `0000_material_jane_foster.sql` (baseline), `0001_fractional_credit_hours.sql` (`credit_entries.hours` -> `numeric(8,2)`), `0002_notification_state.sql` (bell read/mute table, additive), `0003_supreme_victor_mancha.sql` (`absences.lesson_id` unique), `0004_gorgeous_maverick.sql` (`lessons_active_teacher_date_time_uidx`, partial unique index on `(teacher_id, date, time)` where `status in ('scheduled','live')`), `0005_zippy_thunderbolt_ross.sql` (`library_items`, `lesson_library_items`, additive), `0006_large_the_hand.sql` (`library_items_status_check` CHECK, additive), plus `meta/_journal.json` and snapshots. `_journal.json` and the snapshot move with the SQL; never hand-edit them.
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
- A unique or partial-unique index migration fails on a database that already violates it. Before applying
  one, inventory the offending rows read-only and pick a target database that satisfies it.
- **Disposable review database & dev `lumina` alignment (Nov 23, 2026):** `0004` was first verified on a
  separate `lumina_review` clone, and then applied to dev `lumina` after a `pg_dump` backup and
  user-approved non-destructive cancellation of its 13 test-residue duplicate rows. Default `backend/.env`
  (`lumina`) now carried all 5 migrations (`0000`–`0004`) on Nov 23; `0005` and `0006` were applied in Phase 04 on Nov 24, 2026 (latest migration is now `0006`). Keep `lumina_review` as a disposable rehearsal
  target for risky future migrations (`$env:DATABASE_URL='postgres://lumina:<pw>@localhost:5432/lumina_review'`);
  the `lumina` role has no `CREATEDB`, so new review DBs are created via the local `postgres` superuser with
  `OWNER lumina`.
- Partial index SQL is generated from the Drizzle index builder's `where(sql...)` clause; confirm the emitted
  `WHERE` predicate, not just the column list, when reviewing `db:generate` output.
