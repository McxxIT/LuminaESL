import fp from "fastify-plugin";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";

export type DbPluginOptions = {
  connectionString: string;
  max?: number;
};

export default fp<DbPluginOptions>(
  async (app, options) => {
    const client = postgres(options.connectionString, {
      max: options.max ?? 10,
      onnotice: () => undefined,
    });
    const db = drizzle(client, { schema });

    app.decorate("db", db);
    app.addHook("onClose", async () => {
      await client.end({ timeout: 5 });
    });
  },
  { name: "db" },
);
