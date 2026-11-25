---
name: context:all-database
description: "Drizzle/PostgreSQL schema, migrations, seed/reset, and booking/credit integrity — the database group entrypoint/router"
keywords: database, drizzle, postgres, schema, migration, drizzle-kit, seed, reset, credit ledger, booking, slot, transaction, refund
related: [context:all-auth]
date: 17-11-26
---

# Database Context

BLUF: Lumina ESL uses PostgreSQL 15+ through Drizzle ORM (`drizzle-orm` 0.38, `drizzle-kit` 0.30, `postgres` 3.4 driver). The single schema file is `backend/src/db/schema.ts`; migrations live in `backend/src/db/migrations/`. Schema changes must stay in sync with API routes, frontend types, and the contract test.

Use this file after `process/context/all-context.md` when the task touches schema, migrations, seeding, or booking/credit data integrity.

## Scope

This group covers:

- Table and enum layout in `backend/src/db/schema.ts`
- Drizzle migration workflow and `drizzle.config.ts`
- `db:seed` / `db:reset` behavior (destructive reset)
- Atomic booking, credit ledger, and refund rules plus known observed risks

It does not cover:

- JWT/cookie auth and role scoping (see `process/context/auth/all-auth.md`)
- Test commands and gates (see `process/context/tests/all-tests.md`)
- Feature plans (see `process/features/`)

## Read When

Read this entrypoint when:

- adding or changing a table, column, enum, or index
- generating or applying a migration
- touching booking, cancellation, refund, or credit code in `backend/src/routes/{bookings,lessons,credits}.ts`
- running `db:reset` or changing seed data

## Quick Routing

- use `process/context/database/schema-and-models.md` for tables, enums, relationships, and the DB plugin
- use `process/context/database/migrations-workflow.md` for generate/migrate steps and the keep-in-sync checklist
- use `process/context/database/seed-and-reset.md` for seed accounts and the destructive reset
- use `process/context/database/booking-and-credit-integrity.md` for double-booking prevention, ledger rules, refunds, and known risks

## Source Paths

- `process/context/database/schema-and-models.md`
- `process/context/database/migrations-workflow.md`
- `process/context/database/seed-and-reset.md`
- `process/context/database/booking-and-credit-integrity.md`
- Code: `backend/src/db/`, `backend/drizzle.config.ts`, `backend/src/plugins/db.ts`

## Update Triggers

Update this group when:

- `schema.ts` gains or loses tables/enums or a migration is added
- booking/cancel/refund logic or settings defaults change
- reset/seed scripts change, or hosting moves beyond local Postgres

## Canonical Notes

- use `process/context/database/all-database.md` as the entrypoint
- Root scripts: `npm run db:generate | db:migrate | db:push | db:seed | db:reset | db:studio`
