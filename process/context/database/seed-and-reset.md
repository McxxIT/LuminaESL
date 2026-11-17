---
name: context:database-seed-and-reset
description: "Demo seed data and the destructive db:reset script"
keywords: seed, reset, db:reset, db:seed, truncate, demo data, Password123, destructive
related: [context:all-database, context:all-auth]
date: 17-11-26
---

# Seed and Reset

BLUF: `npm run db:seed` upserts demo data; `npm run db:reset` TRUNCATES every table first. Reset is DESTRUCTIVE — never use it as a test gate or run it against data you care about.

## Seed (`backend/src/db/seed.ts`)

- Uses `loadEnv()` + a one-connection `postgres` client; hashes with `lib/password.ts` (scrypt).
- Demo password constant `DEMO_PASSWORD = "Password123!"` for all seeded accounts (admin@, manager@, manager2@, teacher@, student@ at `@lumina.school`).
- Seeds users, profiles, courses/units/lesson plans, enrollments, lessons, slots, ratings, assignments, credits, and the singleton `settings` row. Dates are relative to today (`isoDate(offset)`).

## Reset (`backend/src/db/reset.ts`)

- Command chain: `tsx src/db/reset.ts && drizzle-kit migrate && tsx src/db/seed.ts`.
- Truncates (`RESTART IDENTITY CASCADE`): activity, credit_entries, assignments, ratings, absences, requests, slot_openings, lessons, enrollments, attachments, lesson_plans, course_units, courses, student_profiles, teacher_profiles, refresh_tokens, users, settings.
- Refuses when `NODE_ENV=production`. Prints the DB URL with credentials masked.
- Note: a new table must be added to the `TABLES` list in `reset.ts` or reset will leave stale rows.

The frontend has a separate "Reset demo workspace" action that only reseeds the browser store (local mode); it does not touch Postgres.
