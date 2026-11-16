import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema";
import { activity } from "../db/schema";

type Db = PostgresJsDatabase<typeof schema>;

export type ActivityInput = {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
};

export async function logActivity(
  db: Db,
  input: ActivityInput,
): Promise<void> {
  await db.insert(activity).values(input);
}
