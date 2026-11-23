---
name: evidence:booking-collision-duplicate-inventory
description: "RFC-001 preflight: active duplicate inventory for lessons(teacher_id, date, time) before the partial unique index migration"
date: 21-11-26
feature: lessons-scheduling
plan: booking-collision-refund-policy_PLAN_20-11-26.md
---

# Booking Collision - Active Duplicate Inventory (RFC-001 Preflight)

**Date**: 21-11-26 (re-run after the two credit-ledger parity runs; see §8)
**Database**: local dev Postgres (`postgres://lumina@localhost:5432/lumina`, from `backend/.env`)
**Access**: read-only queries only. No migration, no `db:reset`, no `db:push`, no `DELETE`/`UPDATE`.
**Status**: ✅ **RESOLVED (23-11-26)** - dev DB still holds the 13 rows; the migration gate was cleared by
applying only to a disposable review database (`lumina_review`). See §6 and §9.

## 1. Lesson totals

| status | rows |
|---|---|
| scheduled | 207 |
| completed | 68 |
| cancelled | 189 |

## 2. Active duplicate groups (`status IN ('scheduled','live')`)

**Result: 2 groups / 13 rows.** Both belong to the same teacher and the same student.

| # | teacher | date | time | active rows | lesson ids |
|---|---|---|---|---|---|
| 1 | Alex Johnson (`8f774aa8-c77a-4049-a109-b8c758f5af1c`) | 2026-11-29 | 06:00 | 8 | `53474a90`, `575c541c`, `6c8161f2`, `ab39aaa3`, `b102d27a`, `d052e18c`, `d3256373`, `db3d4155` |
| 2 | Alex Johnson (`8f774aa8-c77a-4049-a109-b8c758f5af1c`) | 2026-11-30 | 06:00 | 5 | `380cfff4`, `f91f9747` + 3 added by the 21-11-26 verification runs |

Full ids:

- 2026-11-29 06:00: `53474a90-e774-4635-8247-f975d26561c7`, `575c541c-e3f6-4d1b-9f65-54cdc5c7b33f`,
  `6c8161f2-c997-45ce-b08a-067d3e66b35f`, `ab39aaa3-bf97-41a2-84f9-8ce941d47699`,
  `b102d27a-2e43-49c7-918b-8db2bf5d6bec`, `d052e18c-b734-44b7-adbb-6650d8cea9a2`,
  `d3256373-6948-4bb5-b80a-3a7012bf5c2c`, `db3d4155-eb1b-4a27-8c72-215bcc64fb6f`
- 2026-11-30 06:00: `380cfff4-5603-4aec-9b78-bf23be7375f7`, `f91f9747-0c2f-451b-8a37-3aab16ad7405`,
  plus three rows created on 21-11-26 by `api/credit-concurrency.spec.ts` (see §8).

Student for all rows: `3146ef99-56f2-4719-8370-8c626656ea60`.

## 3. Historical-only duplicate groups

**Result: 8 groups.** None contains a `scheduled`/`live` row, so the partial index predicate excludes
them and they need no cleanup.

| teacher | date | time | rows | statuses |
|---|---|---|---|---|
| Alex Johnson | 2026-11-19 | 06:00 | 8 | cancelled |
| Alex Johnson | 2026-11-20 | 06:00 | 3 | cancelled |
| Alex Johnson | 2026-11-26 | 23:00 | 2 | cancelled |
| Alex Johnson | 2026-11-26 | 23:30 | 8 | cancelled |
| Alex Johnson | 2026-11-27 | 23:30 | 3 | cancelled |
| Alex Johnson | 2026-12-02 | 06:00 | 8 | cancelled |
| Alex Johnson | 2026-12-03 | 06:00 | 3 | cancelled |
| Alex Johnson | 2031-03-05 | 09:00 | 21 | completed |

The 2031-03-05 09:00 group was reported as 12 active rows during the credit-ledger plan; those rows
are now `completed`, so they no longer block the index.

## 4. Index state

`pg_indexes` for `lessons` currently has only:

- `lessons_pkey` (unique, `id`)
- `lessons_student_date_idx` (`student_id`, `date`)
- `lessons_teacher_date_idx` (`teacher_id`, `date`)

No partial unique index on `(teacher_id, date, time)` exists. The planned
`lessons_active_teacher_date_time_uidx` is not present.

## 5. Assessment (agent, not reviewer)

The active duplicates are residue from repeated `api/credit-concurrency.spec.ts` runs: same teacher, same
student, same 06:00 slot, one new row per run, all created by the suite itself. That is consistent with the
residue documented in `credit-ledger-serialization_EXECUTE_20-11-26.md` §5 and is now **proven** by §8: the
three 21-11-26 parity runs added exactly three rows to the 2026-11-30 06:00 group. It still does not
authorize cleanup.

Per the plan's stop condition, migration application stays blocked until a reviewer records exactly one of:

- `no active duplicates` - not possible; 13 rows exist.
- `reviewed cleanup approved` - requires an explicit, separate cleanup decision naming these 13 ids.
- `blocked` - current state.

## 6. Reviewer decision

**RESOLVED 23-11-26 — `disposable/review database chosen`.** The reviewer (session owner) approved the
recommended path: apply the migration only to a **disposable/review database**, keep the dev DB's 13 rows
untouched, and leave the partial index unapplied on dev until a cleanup procedure is approved.

Consequences recorded:

- The dev database `lumina` was **not** migrated and its 13 duplicate rows are unchanged.
- A new database `lumina_review` was created, all five migrations (`0000`-`0004`) were applied to it, and
  it was seeded. Its active duplicate inventory is **0 groups**.
- RFC-002/RFC-003/RFC-004 verification must run against `lumina_review`, not `lumina`.
- No cleanup, cancellation, reassignment, merge, or deletion has been performed anywhere.
- The `reviewed cleanup approved` decision for the dev DB is still **not** granted; if the dev DB must
  ever be migrated, that decision is still required.

## 7. Reproduction

Queries used (read-only, run with `postgres` from `backend/`, `DATABASE_URL` from `backend/.env`):

```sql
select status, count(*)::int from lessons group by status order by status;

select l.teacher_id, u.name, l.date, l.time, count(*)::int,
       array_agg(l.id order by l.id), array_agg(l.status order by l.id)
from lessons l left join users u on u.id = l.teacher_id
where l.status in ('scheduled','live')
group by l.teacher_id, u.name, l.date, l.time
having count(*) > 1
order by l.date, l.time;

select l.teacher_id, l.date, l.time, count(*)::int, array_agg(l.status order by l.id)
from lessons l
group by l.teacher_id, l.date, l.time
having count(*) > 1 and count(*) filter (where l.status in ('scheduled','live')) = 0
order by l.date, l.time;

select indexname, indexdef from pg_indexes where tablename = 'lessons' order by indexname;
```

## 8. Change caused by the verification runs (proof of self-collision)

The credit-ledger closeout ran `npm run e2e` three times on 21-11-26 (one run failed on an unrelated stale
lookup, then two clean runs). Each API run executes `api/credit-concurrency.spec.ts`, which:

- books on `isoDaysFromNow(9)` (2026-11-30) at the first candidate time with no open slot - always `06:00`;
- creates a cancel-race lesson on `isoDaysFromNow(12)` (2026-12-03) at `06:00`;
- creates an absence-race lesson on `isoDaysFromNow(-1)` (2026-11-20) at `06:00`.

Measured effect on the duplicate groups:

| group | before the 3 runs | after |
|---|---|---|
| 2026-11-30 06:00 (scheduled) | 2 | **5** |
| 2026-11-20 06:00 (cancelled) | 0 | 3 |
| 2026-12-03 06:00 (cancelled) | 0 | 3 |

This is the RFC-004 problem in advance: once `lessons_active_teacher_date_time_uidx` exists, run 2 and
run 3 would have received `409 CONFLICT` instead of creating a lesson. The specs must therefore choose a
teacher/date/time that has **no active lesson**, not merely a time with no open slot - or the collision
specs must run against a disposable database. Any fix belongs to RFC-004, not to this inventory.

## 9. RFC-001 steps 4-6 completion evidence (23-11-26)

### 9.1 Schema and migration artifacts

| Artifact | Result |
|---|---|
| `backend/src/db/schema.ts` | `lessons` table now declares `uniqueIndex("lessons_active_teacher_date_time_uidx").on(teacherId, date, time).where(sql\`${table.status} in ('scheduled', 'live')\`)` |
| `backend/src/db/migrations/0004_gorgeous_maverick.sql` | `CREATE UNIQUE INDEX "lessons_active_teacher_date_time_uidx" ON "lessons" USING btree ("teacher_id","date","time") WHERE "lessons"."status" in ('scheduled', 'live');` |
| `meta/_journal.json` | entry `idx: 4`, tag `0004_gorgeous_maverick` appended by `db:generate` (not hand-edited) |
| `meta/0004_snapshot.json` | generated alongside the SQL |

Exact index name and predicate both match the plan's BC-1/E3 contract.

### 9.2 Applied to the disposable review database

- Created `lumina_review` (owner `lumina`) — the `lumina` role has no `CREATEDB` grant, so the database was
  created via the local `postgres` superuser connection.
- `DATABASE_URL=.../lumina_review npm run db:migrate` → all 5 migrations applied, `drizzle.__drizzle_migrations`
  row count = 5.
- `DATABASE_URL=.../lumina_review npm run db:seed` → seed complete (2 lessons, upsert-only, no deletes).
- Post-migration inventory on `lumina_review`: **0 active duplicate groups**; statuses scheduled 1, completed 1.

Index metadata on `lumina_review`:

```text
lessons_active_teacher_date_time_uidx | CREATE UNIQUE INDEX lessons_active_teacher_date_time_uidx ON public.lessons
  USING btree (teacher_id, date, "time")
  WHERE (status = ANY (ARRAY['scheduled'::lesson_status, 'live'::lesson_status]))
```

### 9.3 Behavioral probe (all inside `BEGIN ... ROLLBACK`, 0 rows left behind)

| Probe | Expected | Observed |
|---|---|---|
| First active lesson at a key | insert ok | `INSERT 0 1` |
| Second active lesson at same key | `23505` on named index | `duplicate key value violates unique constraint "lessons_active_teacher_date_time_uidx"` |
| `cancelled` row at same key | insert ok | `INSERT 0 1` |
| `completed` row at same key | insert ok | `INSERT 0 1` |
| One active lesson alongside that history | insert ok | `INSERT 0 1` |
| Second active lesson alongside that history | `23505` | `23505` on the named index |
| Different teacher, same date/time | insert ok | `INSERT 0 1` |
| Same teacher, different time | insert ok | `INSERT 0 1` |
| `scheduled` -> `cancelled`, then re-book the key | insert ok, history retained | cancelled row kept, new `scheduled` row inserted |
| Post-rollback row count | 0 | 0 |

### 9.4 Isolation check (dev DB untouched)

- `lumina` indexes after the work: still only `lessons_pkey`, `lessons_student_date_idx`, `lessons_teacher_date_idx`.
- `lumina` active duplicates after the work: still the same **2 groups / 13 rows** (8 + 5).
- `lumina` lesson totals unchanged: scheduled 207, completed 68, cancelled 189.

### 9.5 Static gate

- `npm run typecheck` (both workspaces) → clean.

**RFC-001 exit status: ✅ complete on the review DB.** Remaining RFC-001 caveat: the dev database is still
unmigrated by design, so `npm run e2e`/`npm run smoke` against `lumina` will keep producing the residue
described in §8 until either the specs target `lumina_review` or the dev cleanup is approved.

