import fp from "fastify-plugin";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";

/**
- Postgres `numeric` (OID 1700) arrives as a string by default. The ledger column
- `credit_entries.hours` and `sum(hours)` aggregates are numeric, so parse them to
- JS numbers. `from` is required: postgres.js registers parsers only from it.
- bigint/int8 keep the driver default.
 */
export const pgTypes = {
  numeric: {
    to: 1700,
    from: [1700],
    serialize: (value: number | string) => String(value),
    parse: (value: string) => Number(value),
  },
};

export type DbPluginOptions = {
  connectionString: string;
  max?: number;
};

export default fp<DbPluginOptions>(
  async (app, options) => {
    const client = postgres(options.connectionString, {
      max: options.max ?? 10,
      onnotice: () => undefined,
      types: pgTypes,
    });
    const db = drizzle(client, { schema });

    app.decorate("db", db);
    app.addHook("onClose", async () => {
      await client.end({ timeout: 5 });
    });
  },
  { name: "db" },
);