import { eq, sql } from "drizzle-orm";
import { creditEntries } from "../db/schema";
import type { DbOrTx } from "./db-handle";

/**
 * Serializes every credit mutation for one student.
 *
 * `getCreditBalance()` plus the matching insert are only consistent if nothing
 * else can read-then-write the same ledger in between: without a lock two
 * concurrent bookings both see the same balance and both debit, driving the
 * sum negative. This takes a transaction-scoped Postgres advisory lock keyed on
 * the student id, so it is released automatically on commit or rollback.
 *
 * Call it as the *first* statement of any transaction that reads or writes
 * `credit_entries`, before slots, lessons, requests, or absences. One lock
 * order everywhere is what keeps concurrent credit paths deadlock-free.
 */
export async function lockStudentCredits(
  db: DbOrTx,
  studentId: string,
): Promise<void> {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${studentId}::text, 0))`,
  );
}

/**
 * Exact ledger balance for a student. `hours` is `numeric`; the pg type parser
 * (plugins/db.ts) returns it as a JS number. `Number()` guards a string fallback.
 */
export async function getCreditBalance(
  db: DbOrTx,
  studentId: string,
): Promise<number> {
  const [row] = await db
    .select({
      value: sql<number>`coalesce(sum(${creditEntries.hours}), 0)`,
    })
    .from(creditEntries)
    .where(eq(creditEntries.studentId, studentId));
  return Number(row?.value ?? 0);
}
