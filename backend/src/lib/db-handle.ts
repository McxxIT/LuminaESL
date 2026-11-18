import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema";

/** A drizzle handle that accepts both `app.db` and a transaction `tx`. */
export type DbOrTx = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;
