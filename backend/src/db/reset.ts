import "dotenv/config";
import postgres from "postgres";
import { loadEnv } from "../config/env";

const TABLES = [
  "activity",
  "credit_entries",
  "assignments",
  "ratings",
  "absences",
  "requests",
  "slot_openings",
  "lessons",
  "enrollments",
  "attachments",
  "lesson_plans",
  "course_units",
  "courses",
  "student_profiles",
  "teacher_profiles",
  "refresh_tokens",
  "users",
  "settings",
];

const env = loadEnv();

if (env.NODE_ENV === "production") {
  console.error("Refusing to reset the database when NODE_ENV=production.");
  process.exit(1);
}

console.log("Destructive reset. This truncates every Lumina table and reseeds demo data.");
console.log(`Database: ${env.DATABASE_URL.replace(/:\/\/[^@]+@/, "://<credentials>@")}`);
console.log(`Tables: ${TABLES.join(", ")}`);

const client = postgres(env.DATABASE_URL, { max: 1, onnotice: () => undefined });

async function main() {
  await client.unsafe(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  console.log("Tables truncated.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end({ timeout: 5 });
  });
