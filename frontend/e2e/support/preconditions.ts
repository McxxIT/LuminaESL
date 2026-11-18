import {
  API_BASE,
  BACKEND_ORIGIN,
  apiLogin,
  bootstrap,
  userByEmail,
  type ApiUser,
  type Bootstrap,
} from "./api";

export type Preconditions = {
  adminToken: string;
  school: Bootstrap;
  admin: ApiUser;
  manager: ApiUser;
  teacher: ApiUser;
  student: ApiUser;
};

let checked: Promise<Preconditions> | null = null;

/**
 * Verifies the environment a live run needs, and never repairs it.
 * Memoised per worker so the checks cost one round trip per suite.
 */
export function ensurePreconditions(): Promise<Preconditions> {
  checked ??= checkPreconditions();
  return checked;
}

async function checkPreconditions(): Promise<Preconditions> {
  let health: Response;
  try {
    health = await fetch(`${BACKEND_ORIGIN}/health`);
  } catch {
    throw new Error(
      [
        `Precondition failed: the backend is not reachable at ${BACKEND_ORIGIN}.`,
        "Start it with `npm run dev:api` (or let Playwright start it) and make sure backend/.env points at a running Postgres.",
      ].join("\n"),
    );
  }
  if (!health.ok) {
    throw new Error(
      `Precondition failed: ${BACKEND_ORIGIN}/health returned ${health.status}. Check the backend logs and database connection.`,
    );
  }

  let adminToken: string;
  try {
    adminToken = await apiLogin("admin@lumina.school");
  } catch (cause) {
    throw new Error(
      [
        "Precondition failed: the seeded admin account cannot sign in through the API.",
        `Set up the database with \`npm run db:migrate\` then \`npm run db:seed\` (API base: ${API_BASE}).`,
        `Cause: ${(cause as Error).message}`,
      ].join("\n"),
    );
  }

  const school = await bootstrap(adminToken);
  const required = {
    admin: "admin@lumina.school",
    manager: "manager@lumina.school",
    teacher: "teacher@lumina.school",
    student: "student@lumina.school",
  } as const;

  const users = {} as Record<keyof typeof required, ApiUser>;
  const missing: string[] = [];
  for (const [key, email] of Object.entries(required) as [keyof typeof required, string][]) {
    try {
      users[key] = userByEmail(school, email);
    } catch {
      missing.push(email);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      [
        `Precondition failed: seeded accounts are missing (${missing.join(", ")}).`,
        "Run `npm run db:seed` against the dev database. The suite never seeds or repairs on its own.",
      ].join("\n"),
    );
  }
  if (Object.keys(school.collections.lessons).length === 0) {
    throw new Error(
      [
        "Precondition failed: the database has no lessons, so booking and refund flows cannot run.",
        "Run `npm run db:seed` against the dev database.",
      ].join("\n"),
    );
  }

  return { adminToken, school, ...users };
}
