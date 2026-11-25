import { eq, sql } from "drizzle-orm";
import { creditEntries } from "../db/schema";
import type { DbOrTx } from "./db-handle";

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
