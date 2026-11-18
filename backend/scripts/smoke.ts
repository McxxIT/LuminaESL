/**
 * API smoke test: proves every B3 domain end to end against the local Postgres.
 *
 *   npm run smoke            (root alias)  |  npm run smoke --workspace @lumina/backend
 *
 * Starts a temporary backend on 127.0.0.1:4100 (`SMOKE_PORT`), creates its own
 * fixtures (emails `smoke-{runId}-*@smoke.lumina.test`), and checks role
 * allow/deny, exact credit deltas, and exactly one activity row per mutation.
 *
 * Safety: never resets, pushes, or deletes data; refuses NODE_ENV=production and
 * non-local database hosts (unless SMOKE_ALLOW_REMOTE=1); never writes env files;
 * never listens on 4000. Settings it changes are restored in `finally` and on
 * SIGINT; smoke users are archived at the end. Fixture rows are left behind.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { loadEnv } from "../src/config/env";
import * as schema from "../src/db/schema";
import { settings, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";

// ---------------------------------------------------------------- guards

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const port = Number(process.env.SMOKE_PORT ?? 4100);

function refuse(message: string): never {
  console.error(`SMOKE REFUSED: ${message}`);
  process.exit(2);
}

if (process.env.NODE_ENV === "production") refuse("NODE_ENV is production.");
if (!Number.isInteger(port) || port <= 0) refuse("SMOKE_PORT must be a port number.");
if (port === 4000) refuse("port 4000 is the dev backend; use another SMOKE_PORT.");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) refuse("DATABASE_URL is not set (backend env file missing?).");
let dbHost = "";
try {
  dbHost = new URL(databaseUrl).hostname;
} catch {
  refuse("DATABASE_URL is not a valid URL.");
}
if (!LOCAL_HOSTS.has(dbHost) && process.env.SMOKE_ALLOW_REMOTE !== "1") {
  refuse(`database host "${dbHost}" is not local (set SMOKE_ALLOW_REMOTE=1 to override).`);
}

const uploadDir = join(tmpdir(), "lumina-smoke-uploads");
mkdirSync(uploadDir, { recursive: true });

// In-memory env only: the env file is read, never written.
const env = loadEnv({
  ...process.env,
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: String(port),
  LOG_LEVEL: "error",
  RATE_LIMIT_MAX: "100000",
  UPLOAD_DIR: uploadDir,
});

const runId = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const password = randomBytes(18).toString("base64url");
const emailFor = (label: string) => `smoke-${runId}-${label}@smoke.lumina.test`;
const base = `http://127.0.0.1:${port}/api/v1`;

const client = postgres(databaseUrl, { max: 2, onnotice: () => undefined });
const db = drizzle(client, { schema });
let app: FastifyInstance | undefined;
let adminId: string | undefined;
let originalSettings: { late: number; refund: boolean } | null = null;
let settingsCaptured = false;

// ---------------------------------------------------------------- cleanup

let cleaned = false;
async function cleanup(): Promise<void> {
  if (cleaned) return;
  cleaned = true;
  if (settingsCaptured) {
    const restore = originalSettings ?? { late: 24, refund: true };
    try {
      await db
        .update(settings)
        .set({
          studentLateCancellationHours: restore.late,
          refundTeacherCancellations: restore.refund,
        })
        .where(eq(settings.id, 1));
      console.log(
        `settings restored: studentLateCancellationHours=${restore.late} refundTeacherCancellations=${restore.refund}`,
      );
    } catch (error) {
      console.error("FAILED to restore settings; restore them by hand:", restore, error);
    }
  }
  if (adminId) {
    try {
      await db.update(users).set({ status: "archived" }).where(eq(users.id, adminId));
    } catch (error) {
      console.error("FAILED to archive the smoke admin:", error);
    }
  }
  try {
    await db
      .update(users)
      .set({ status: "archived" })
      .where(like(users.email, `smoke-${runId}-%`));
  } catch (error) {
    console.error("Could not archive smoke users (best effort):", error);
  }
  if (app) await app.close().catch(() => undefined);
  await client.end({ timeout: 5 }).catch(() => undefined);
}

process.on("SIGINT", () => {
  console.error("SIGINT: restoring settings and exiting");
  void cleanup().finally(() => process.exit(130));
});

// ---------------------------------------------------------------- http + assertions

type Res = { status: number; body: unknown };

function obj(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context}: expected an object, got ${JSON.stringify(value)}`);
  }
  return value as Record<string, unknown>;
}
function str(value: unknown, key: string): string {
  const field = obj(value, key)[key];
  if (typeof field !== "string") throw new Error(`expected string "${key}", got ${JSON.stringify(field)}`);
  return field;
}
function num(value: unknown, key: string): number {
  const field = obj(value, key)[key];
  if (typeof field !== "number") throw new Error(`expected number "${key}", got ${typeof field} ${JSON.stringify(field)}`);
  return field;
}
function arr(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${context}: expected an array`);
  return value;
}

async function call(token: string | null, method: string, path: string, body?: unknown): Promise<Res> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: string | FormData | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${base}${path}`, { method, headers, body: payload });
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }
  return { status: response.status, body: parsed };
}

let checkCount = 0;
function check(condition: boolean, message: string): void {
  checkCount += 1;
  if (!condition) throw new Error(message);
}
function expectStatus(res: Res, expected: number, label: string): void {
  check(res.status === expected, `${label}: expected HTTP ${expected}, got ${res.status} ${JSON.stringify(res.body)}`);
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// ---------------------------------------------------------------- fixtures

type Actor = { id: string; token: string; label: string };
const actors: Record<string, Actor> = {};
const tok = (label: string): string => {
  const actor = actors[label];
  if (!actor) throw new Error(`unknown actor ${label}`);
  return actor.token;
};
const uid = (label: string): string => {
  const actor = actors[label];
  if (!actor) throw new Error(`unknown actor ${label}`);
  return actor.id;
};

async function login(label: string, email: string): Promise<Actor> {
  const res = await call(null, "POST", "/auth/login", { email, password });
  expectStatus(res, 200, `login ${label}`);
  const user = obj(obj(res.body, "login").user, "login.user");
  const actor = { id: str(user, "id"), token: str(res.body, "accessToken"), label };
  actors[label] = actor;
  return actor;
}

async function createUser(label: string, role: "manager" | "teacher" | "student", managerId?: string): Promise<Actor> {
  const res = await call(tok("admin"), "POST", "/users", {
    name: `Smoke ${label} ${runId}`,
    email: emailFor(label),
    password,
    role,
    ...(managerId ? { managerId } : {}),
  });
  expectStatus(res, 201, `create ${label}`);
  return login(label, emailFor(label));
}

function localDate(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
const usedTimes = new Map<string, number>();
/** A fresh (date, time) for this run: 30-minute steps from 08:00, unique per date. */
function nextSlot(daysFromToday: number): { date: string; time: string } {
  const date = localDate(daysFromToday);
  const index = usedTimes.get(date) ?? 0;
  usedTimes.set(date, index + 1);
  if (index >= 28) throw new Error(`ran out of slot times on ${date}`);
  const minutes = 8 * 60 + index * 30;
  const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { date, time };
}

async function balance(studentLabel: string): Promise<number> {
  const res = await call(tok("admin"), "GET", `/credits/balance/${uid(studentLabel)}`);
  expectStatus(res, 200, `balance ${studentLabel}`);
  return num(res.body, "balance");
}

async function activityCount(targetType: string, targetId: string, action: string): Promise<number> {
  const query = new URLSearchParams({ targetType, targetId, action, limit: "100" });
  const res = await call(tok("admin"), "GET", `/activity?${query.toString()}`);
  expectStatus(res, 200, "activity list");
  return num(res.body, "total");
}
async function expectOneActivity(targetType: string, targetId: string, action: string): Promise<void> {
  const count = await activityCount(targetType, targetId, action);
  check(count === 1, `activity ${action} on ${targetType}:${targetId}: expected exactly 1 row, got ${count}`);
}
async function expectNoActivity(targetType: string, targetId: string, action: string): Promise<void> {
  const count = await activityCount(targetType, targetId, action);
  check(count === 0, `activity ${action} on ${targetType}:${targetId}: expected 0 rows, got ${count}`);
}

async function openSlot(token: string, teacherId: string, slot: { date: string; time: string }): Promise<string> {
  const res = await call(token, "POST", "/bookings/slots", { teacherId, ...slot });
  expectStatus(res, 201, `open slot ${slot.date} ${slot.time}`);
  return str(res.body, "id");
}
async function slotExists(teacherId: string, slotId: string, date: string): Promise<boolean> {
  const res = await call(tok("admin"), "GET", `/bookings/slots?teacherId=${teacherId}&from=${date}&to=${date}`);
  expectStatus(res, 200, "list slots");
  return arr(res.body, "slots").some((item) => obj(item, "slot").id === slotId);
}
async function book(token: string, slotId: string, studentId?: string): Promise<Res> {
  return call(token, "POST", "/bookings", { slotId, ...(studentId ? { studentId } : {}) });
}
async function getLesson(lessonId: string): Promise<Record<string, unknown>> {
  const res = await call(tok("admin"), "GET", `/lessons/${lessonId}`);
  expectStatus(res, 200, "get lesson");
  return obj(res.body, "lesson");
}
async function scheduleLesson(token: string, teacherId: string, studentId: string, slot: { date: string; time: string }): Promise<string> {
  const res = await call(token, "POST", "/lessons", { teacherId, studentId, ...slot, title: "Smoke lesson" });
  expectStatus(res, 201, "schedule lesson");
  return str(res.body, "id");
}
/** Book a slot for sA through the student API; returns the lesson id. */
async function bookFor(studentLabel: string, teacherLabel: string, days: number): Promise<string> {
  const slotId = await openSlot(tok(teacherLabel), uid(teacherLabel), nextSlot(days));
  const res = await book(tok(studentLabel), slotId);
  expectStatus(res, 201, "book lesson");
  return str(res.body, "id");
}
async function addCredits(studentLabel: string, hours: number, reason: "purchase" | "adjustment" = "adjustment"): Promise<void> {
  const res = await call(tok("admin"), "POST", "/credits", {
    studentId: uid(studentLabel), hours, reason, description: "Smoke fixture credits",
  });
  expectStatus(res, 201, `credits for ${studentLabel}`);
}

let enrollmentId = "";
let firstPlanId = "";

async function setup(): Promise<void> {
  const [row] = await db
    .select({ late: settings.studentLateCancellationHours, refund: settings.refundTeacherCancellations })
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);
  originalSettings = row ?? null;
  settingsCaptured = true;
  console.log(
    row
      ? `original settings: studentLateCancellationHours=${row.late} refundTeacherCancellations=${row.refund}`
      : "original settings: no row (defaults 24 / true will be restored)",
  );

  const [admin] = await db
    .insert(users)
    .values({
      role: "admin",
      name: `Smoke admin ${runId}`,
      email: emailFor("admin"),
      passwordHash: await hashPassword(password),
      status: "active",
    })
    .returning({ id: users.id });
  if (!admin) throw new Error("could not insert the smoke admin");
  adminId = admin.id;
  await login("admin", emailFor("admin"));

  const mA = await createUser("managerA", "manager");
  const mB = await createUser("managerB", "manager");
  await createUser("teacherA", "teacher", mA.id);
  await createUser("teacherB", "teacher", mB.id);
  await createUser("studentA", "student", mA.id);
  await createUser("studentZero", "student", mA.id);
  await createUser("studentR", "student", mA.id);
  await createUser("studentB", "student", mB.id);

  const course = await call(tok("managerA"), "POST", "/courses", { title: `Smoke course ${runId}`, level: "B1", status: "published" });
  expectStatus(course, 201, "create course");
  const courseId = str(course.body, "id");
  const unit = await call(tok("managerA"), "POST", `/courses/${courseId}/units`, { title: "Unit 1", order: 0 });
  expectStatus(unit, 201, "create unit");
  const unitId = str(unit.body, "id");
  for (let order = 0; order < 12; order += 1) {
    const plan = await call(tok("managerA"), "POST", `/courses/${courseId}/units/${unitId}/plans`, { title: `Plan ${order + 1}`, order });
    expectStatus(plan, 201, "create plan");
    if (order === 0) firstPlanId = str(plan.body, "id");
  }
  const enrollment = await call(tok("managerA"), "POST", "/enrollments", { studentId: uid("studentA"), teacherId: uid("teacherA"), courseId });
  expectStatus(enrollment, 201, "create enrollment");
  enrollmentId = str(enrollment.body, "id");

  await addCredits("studentA", 20, "purchase");
  await addCredits("studentB", 10, "purchase");
}

// ---------------------------------------------------------------- scenarios

async function settingsScenario(): Promise<void> {
  const denied = await call(tok("managerA"), "PATCH", "/settings", { studentLateCancellationHours: 72 });
  expectStatus(denied, 403, "manager edits settings");
  const outOfRange = await call(tok("admin"), "PATCH", "/settings", { studentLateCancellationHours: 999 });
  expectStatus(outOfRange, 400, "out-of-range setting");
  const before = await activityCount("school", "settings", "settings.updated");
  expectStatus(await call(tok("admin"), "PATCH", "/settings", { studentLateCancellationHours: 73 }), 200, "admin edits settings");
  expectStatus(await call(tok("admin"), "PATCH", "/settings", { studentLateCancellationHours: 72, refundTeacherCancellations: true }), 200, "admin sets smoke settings");
  const after = await activityCount("school", "settings", "settings.updated");
  check(after - before === 2, `settings.updated: expected exactly 2 new rows for 2 changes, got ${after - before}`);
}

async function slotsScenario(): Promise<void> {
  const slot = nextSlot(5);
  const slotId = await openSlot(tok("teacherA"), uid("teacherA"), slot);
  await expectOneActivity("slot", slotId, "slot.opened");
  expectStatus(await call(tok("teacherA"), "POST", "/bookings/slots", slot), 409, "duplicate slot");
  const managerSlot = await openSlot(tok("managerA"), uid("teacherA"), nextSlot(5));
  await expectOneActivity("slot", managerSlot, "slot.opened");
  expectStatus(await call(tok("managerB"), "POST", "/bookings/slots", { teacherId: uid("teacherA"), ...nextSlot(5) }), 403, "cross-team manager opens slot");
  expectStatus(await call(tok("studentA"), "POST", "/bookings/slots", { teacherId: uid("teacherA"), ...nextSlot(5) }), 403, "student opens slot");

  expectStatus(await call(tok("studentA"), "DELETE", `/bookings/slots/${slotId}`), 403, "student closes slot");
  expectStatus(await call(tok("managerB"), "DELETE", `/bookings/slots/${slotId}`), 403, "cross-team manager closes slot");
  expectStatus(await call(tok("teacherB"), "DELETE", `/bookings/slots/${slotId}`), 403, "other teacher closes slot");
  expectStatus(await call(tok("teacherA"), "DELETE", `/bookings/slots/${slotId}`), 200, "teacher closes own slot");
  check(!(await slotExists(uid("teacherA"), slotId, slot.date)), "closed slot still listed");
  await expectOneActivity("slot", slotId, "slot.closed");
  expectStatus(await call(tok("managerA"), "DELETE", `/bookings/slots/${managerSlot}`), 200, "own-team manager closes slot");
  await expectOneActivity("slot", managerSlot, "slot.closed");
}

async function bookingScenario(): Promise<void> {
  const slot = nextSlot(3);
  const slotId = await openSlot(tok("teacherA"), uid("teacherA"), slot);
  expectStatus(await book(tok("teacherA"), slotId, uid("studentA")), 403, "teacher books");

  const before = await balance("studentA");
  const res = await book(tok("studentA"), slotId);
  expectStatus(res, 201, "student books");
  const lessonId = str(res.body, "id");
  check(near(await balance("studentA"), before - 1), "booking must debit exactly 1 credit");
  check(!(await slotExists(uid("teacherA"), slotId, slot.date)), "booked slot still listed");
  await expectOneActivity("lesson", lessonId, "lesson.booked");

  // Enrichment (SPEC 11): plan, enrollment, room code.
  const lesson = await getLesson(lessonId);
  check(lesson.enrollmentId === enrollmentId, `booked lesson enrollmentId ${String(lesson.enrollmentId)} != ${enrollmentId}`);
  check(lesson.lessonPlanId === firstPlanId, `first booked lesson should hold plan 1, got ${String(lesson.lessonPlanId)}`);
  const roomCode = String(lesson.roomCode);
  check(/^ESL-\d{4}$/.test(roomCode) && roomCode.length <= 40, `room code "${roomCode}" must match ESL-####`);

  const again = await book(tok("studentA"), slotId);
  check(again.status === 404 || again.status === 409, `double booking must fail, got ${again.status}`);
  check(near(await balance("studentA"), before - 1), "double booking must not debit again");

  const zeroSlot = nextSlot(3);
  const zeroSlotId = await openSlot(tok("teacherA"), uid("teacherA"), zeroSlot);
  const zero = await book(tok("studentZero"), zeroSlotId);
  expectStatus(zero, 422, "booking with 0 credits");
  check(near(await balance("studentZero"), 0), "0-credit student balance changed");
  check(await slotExists(uid("teacherA"), zeroSlotId, zeroSlot.date), "slot was consumed by a failed booking");
  const lessonsRes = await call(tok("admin"), "GET", `/lessons?studentId=${uid("studentZero")}`);
  expectStatus(lessonsRes, 200, "list 0-credit lessons");
  const items = obj(lessonsRes.body, "lessons").items;
  check(arr(items, "lessons.items").length === 0, "failed booking created a lesson");
}

async function onBehalfScenario(): Promise<void> {
  const slotId = await openSlot(tok("teacherA"), uid("teacherA"), nextSlot(4));
  expectStatus(await book(tok("managerB"), slotId, uid("studentA")), 403, "cross-team manager books on behalf");
  const before = await balance("studentA");
  const res = await book(tok("managerA"), slotId, uid("studentA"));
  expectStatus(res, 201, "own-team manager books on behalf");
  check(near(await balance("studentA"), before - 1), "on-behalf booking must debit exactly 1");
  await expectOneActivity("lesson", str(res.body, "id"), "lesson.booked");

  const bSlot = await openSlot(tok("teacherB"), uid("teacherB"), nextSlot(4));
  const beforeB = await balance("studentB");
  const adminRes = await book(tok("admin"), bSlot, uid("studentB"));
  expectStatus(adminRes, 201, "admin books on behalf");
  check(near(await balance("studentB"), beforeB - 1), "admin on-behalf booking must debit exactly 1");
}

async function rebookScenario(): Promise<void> {
  await addCredits("studentR", 1.5);
  const original = await scheduleLesson(tok("teacherA"), uid("teacherA"), uid("studentR"), nextSlot(6));
  check(near(await balance("studentR"), 1.5), "rebook fixture balance should be 1.5");
  const slot = nextSlot(6);
  await openSlot(tok("teacherA"), uid("teacherA"), slot);
  expectStatus(await call(tok("studentA"), "POST", `/lessons/${original}/rebook`, slot), 403, "other student rebooks");
  const res = await call(tok("studentR"), "POST", `/lessons/${original}/rebook`, slot);
  expectStatus(res, 201, "rebook with 1.5 credits");
  check(near(await balance("studentR"), 0.5), "rebook must debit exactly 1 (1.5 -> 0.5)");
  await expectOneActivity("lesson", str(res.body, "id"), "lesson.booked");
  const slot2 = nextSlot(6);
  await openSlot(tok("teacherA"), uid("teacherA"), slot2);
  const refused = await call(tok("studentR"), "POST", `/lessons/${original}/rebook`, slot2);
  expectStatus(refused, 400, "rebook with 0.5 credits");
  check(near(await balance("studentR"), 0.5), "refused rebook must not debit");
}

let completedLessonId = "";

async function lessonsScenario(): Promise<void> {
  // Schedule via POST /lessons (no debit), with enrichment and lesson.booked.
  expectStatus(await call(tok("studentA"), "POST", "/lessons", { studentId: uid("studentA"), ...nextSlot(7), title: "x" }), 403, "student schedules");
  expectStatus(await call(tok("managerB"), "POST", "/lessons", { teacherId: uid("teacherA"), studentId: uid("studentA"), ...nextSlot(7), title: "x" }), 403, "cross-team manager schedules");
  const before = await balance("studentA");
  const lessonId = await scheduleLesson(tok("teacherA"), uid("teacherA"), uid("studentA"), nextSlot(7));
  check(near(await balance("studentA"), before), "POST /lessons does not change credits");
  await expectOneActivity("lesson", lessonId, "lesson.booked");
  const scheduled = await getLesson(lessonId);
  check(scheduled.enrollmentId === enrollmentId && typeof scheduled.lessonPlanId === "string", "scheduled lesson not enriched");
  check(/^ESL-\d{4}$/.test(String(scheduled.roomCode)), "scheduled lesson room code");

  // Reschedule.
  const moved = nextSlot(8);
  expectStatus(await call(tok("teacherB"), "PATCH", `/lessons/${lessonId}`, moved), 403, "other teacher reschedules");
  expectStatus(await call(tok("teacherA"), "PATCH", `/lessons/${lessonId}`, moved), 200, "teacher reschedules");
  await expectOneActivity("lesson", lessonId, "lesson.rescheduled");

  // Complete; cross-team denied; cancelled lesson cannot be completed.
  expectStatus(await call(tok("managerB"), "POST", `/lessons/${lessonId}/complete`, { attendance: "attended" }), 403, "cross-team manager completes");
  expectStatus(await call(tok("teacherA"), "POST", `/lessons/${lessonId}/complete`, { attendance: "attended" }), 200, "teacher completes");
  await expectOneActivity("lesson", lessonId, "lesson.completed");
  completedLessonId = lessonId;

  // Early cancel (+10 days, window 72h): refund +1. Booking debited 1 first.
  const early = await bookFor("studentA", "teacherA", 10);
  const beforeEarly = await balance("studentA");
  expectStatus(await call(tok("studentB"), "POST", `/lessons/${early}/cancel`, {}), 403, "other student cancels");
  const earlyRes = await call(tok("studentA"), "POST", `/lessons/${early}/cancel`, { reason: "smoke" });
  expectStatus(earlyRes, 200, "early cancel");
  check(obj(earlyRes.body, "cancel").refunded === true, "early cancel must refund");
  check(near(await balance("studentA"), beforeEarly + 1), "early cancel must refund exactly 1");
  await expectOneActivity("lesson", early, "lesson.cancelledByStudent");
  const completeCancelled = await call(tok("teacherA"), "POST", `/lessons/${early}/complete`, { attendance: "attended" });
  expectStatus(completeCancelled, 409, "complete a cancelled lesson");
  check((await getLesson(early)).status === "cancelled", "cancelled lesson changed state");

  // Late cancel (+1 day, window 72h): no refund.
  const late = await bookFor("studentA", "teacherA", 1);
  const beforeLate = await balance("studentA");
  const lateRes = await call(tok("studentA"), "POST", `/lessons/${late}/cancel`, {});
  expectStatus(lateRes, 200, "late cancel");
  check(obj(lateRes.body, "cancel").refunded === false, "late cancel must not refund");
  check(near(await balance("studentA"), beforeLate), "late cancel must not change credits");

  // Teacher absence: future lesson refused, past lesson refunds +1.
  const future = await scheduleLesson(tok("teacherA"), uid("teacherA"), uid("studentA"), nextSlot(9));
  expectStatus(await call(tok("managerA"), "POST", `/lessons/${future}/absence`, { note: "Teacher missed it" }), 400, "absence before start");
  const past = await scheduleLesson(tok("teacherA"), uid("teacherA"), uid("studentA"), nextSlot(-1));
  expectStatus(await call(tok("managerB"), "POST", `/lessons/${past}/absence`, { note: "Teacher missed it" }), 403, "cross-team absence");
  const beforeAbsence = await balance("studentA");
  expectStatus(await call(tok("managerA"), "POST", `/lessons/${past}/absence`, { note: "Teacher missed it" }), 201, "record absence");
  check(near(await balance("studentA"), beforeAbsence + 1), "absence must refund exactly 1");
  await expectOneActivity("lesson", past, "absence.recorded");

  // Absence with refundTeacherCancellations off: no refund.
  expectStatus(await call(tok("admin"), "PATCH", "/settings", { refundTeacherCancellations: false }), 200, "turn refunds off");
  try {
    const past2 = await scheduleLesson(tok("teacherA"), uid("teacherA"), uid("studentA"), nextSlot(-1));
    const beforeOff = await balance("studentA");
    expectStatus(await call(tok("managerA"), "POST", `/lessons/${past2}/absence`, { note: "Teacher missed it" }), 201, "absence with refunds off");
    check(near(await balance("studentA"), beforeOff), "absence must not refund when refunds are off");
  } finally {
    await call(tok("admin"), "PATCH", "/settings", { refundTeacherCancellations: true });
  }
}

async function requestsScenario(): Promise<void> {
  // Slot closure: create, cross-team review denied, approve closes the slot.
  const slot = nextSlot(11);
  const slotId = await openSlot(tok("teacherA"), uid("teacherA"), slot);
  const created = await call(tok("teacherA"), "POST", "/requests", { type: "slot-closure", ...slot, reason: "Smoke closure" });
  expectStatus(created, 201, "create slot-closure request");
  const closureId = str(created.body, "id");
  await expectOneActivity("request", closureId, "request.created");
  expectStatus(await call(tok("studentA"), "POST", "/requests", { type: "slot-closure", ...nextSlot(11), reason: "x" }), 403, "student creates request");
  expectStatus(await call(tok("managerB"), "POST", `/requests/${closureId}/review`, { status: "approved" }), 403, "cross-team review");
  expectStatus(await call(tok("teacherA"), "POST", `/requests/${closureId}/review`, { status: "approved" }), 403, "teacher reviews");
  expectStatus(await call(tok("managerA"), "POST", `/requests/${closureId}/review`, { status: "approved" }), 200, "approve closure");
  check(!(await slotExists(uid("teacherA"), slotId, slot.date)), "approved closure left the slot open");
  await expectOneActivity("request", closureId, "request.approved");
  await expectOneActivity("slot", slotId, "slot.closed");

  // Withdraw: request.withdrawn only, the slot stays open, no slot.* rows.
  const wSlot = nextSlot(11);
  const wSlotId = await openSlot(tok("teacherA"), uid("teacherA"), wSlot);
  const toWithdraw = await call(tok("teacherA"), "POST", "/requests", { type: "slot-closure", ...wSlot, reason: "Smoke withdraw" });
  expectStatus(toWithdraw, 201, "create request to withdraw");
  const withdrawId = str(toWithdraw.body, "id");
  expectStatus(await call(tok("teacherB"), "POST", `/requests/${withdrawId}/withdraw`, {}), 403, "other teacher withdraws");
  expectStatus(await call(tok("teacherA"), "POST", `/requests/${withdrawId}/withdraw`, {}), 200, "withdraw request");
  await expectOneActivity("request", withdrawId, "request.withdrawn");
  check(await slotExists(uid("teacherA"), wSlotId, wSlot.date), "withdrawn closure closed the slot");
  await expectNoActivity("slot", wSlotId, "slot.closed");

  // Reject.
  const rSlot = nextSlot(11);
  const rSlotId = await openSlot(tok("teacherA"), uid("teacherA"), rSlot);
  const toReject = await call(tok("teacherA"), "POST", "/requests", { type: "slot-closure", ...rSlot, reason: "Smoke reject" });
  const rejectId = str(toReject.body, "id");
  expectStatus(await call(tok("managerA"), "POST", `/requests/${rejectId}/review`, { status: "rejected" }), 200, "reject request");
  await expectOneActivity("request", rejectId, "request.rejected");
  check(await slotExists(uid("teacherA"), rSlotId, rSlot.date), "rejected closure closed the slot");

  // Lesson cancellation with an attachment: approve refunds +1 exactly once.
  const lessonId = await bookFor("studentA", "teacherA", 12);
  const form = new FormData();
  form.append("file", new Blob(["smoke attachment"], { type: "text/plain" }), "smoke-note.txt");
  const upload = await call(tok("teacherA"), "POST", "/uploads", form);
  expectStatus(upload, 201, "upload attachment");
  const attachmentId = str(upload.body, "id");
  const cancelReq = await call(tok("teacherA"), "POST", "/requests", { type: "lesson-cancellation", lessonId, reason: "Smoke sick day", attachmentId });
  expectStatus(cancelReq, 201, "create cancellation request");
  const cancelId = str(cancelReq.body, "id");
  check(obj(cancelReq.body, "request").attachmentId === attachmentId, "request did not keep attachmentId");
  const readBack = await call(tok("managerA"), "GET", `/uploads/${attachmentId}`);
  expectStatus(readBack, 200, "read attachment back");
  check(str(readBack.body, "name") === "smoke-note.txt", "attachment name read-back");
  const before = await balance("studentA");
  expectStatus(await call(tok("managerA"), "POST", `/requests/${cancelId}/review`, { status: "approved" }), 200, "approve cancellation");
  check(near(await balance("studentA"), before + 1), "approve-cancel must refund exactly 1");
  check((await getLesson(lessonId)).status === "cancelled", "approved cancellation did not cancel the lesson");
  const second = await call(tok("managerA"), "POST", `/requests/${cancelId}/review`, { status: "approved" });
  check(second.status === 400 || second.status === 409, `second approval must fail, got ${second.status}`);
  check(near(await balance("studentA"), before + 1), "second approval refunded again");
  await expectOneActivity("request", cancelId, "request.approved");

  // Already-cancelled lesson: approval resolves without a refund.
  const early = await bookFor("studentA", "teacherA", 12);
  expectStatus(await call(tok("studentA"), "POST", `/lessons/${early}/cancel`, {}), 200, "student cancels before request");
  const onCancelled = await call(tok("teacherA"), "POST", "/requests", { type: "lesson-cancellation", lessonId: early, reason: "Smoke already cancelled" });
  expectStatus(onCancelled, 201, "request on cancelled lesson");
  const beforeCancelled = await balance("studentA");
  expectStatus(await call(tok("managerA"), "POST", `/requests/${str(onCancelled.body, "id")}/review`, { status: "approved" }), 200, "approve on cancelled lesson");
  check(near(await balance("studentA"), beforeCancelled), "approve on a cancelled lesson must not refund");

  // Completed lesson: refused, request stays pending, no ledger change.
  const done = await scheduleLesson(tok("teacherA"), uid("teacherA"), uid("studentA"), nextSlot(13));
  expectStatus(await call(tok("teacherA"), "POST", `/lessons/${done}/complete`, { attendance: "attended" }), 200, "complete before request");
  const onDone = await call(tok("teacherA"), "POST", "/requests", { type: "lesson-cancellation", lessonId: done, reason: "Smoke completed" });
  expectStatus(onDone, 201, "request on completed lesson");
  const doneId = str(onDone.body, "id");
  const beforeDone = await balance("studentA");
  expectStatus(await call(tok("managerA"), "POST", `/requests/${doneId}/review`, { status: "approved" }), 409, "approve on completed lesson");
  check(near(await balance("studentA"), beforeDone), "refused approval changed credits");
  const pending = await call(tok("managerA"), "GET", `/requests?status=pending&teacherId=${uid("teacherA")}&limit=100`);
  expectStatus(pending, 200, "list pending requests");
  check(arr(obj(pending.body, "requests").items, "items").some((item) => obj(item, "request").id === doneId), "refused request is no longer pending");
  check((await getLesson(done)).status === "completed", "completed lesson changed state");
  await expectNoActivity("request", doneId, "request.approved");

  // Foreign or unknown lesson.
  expectStatus(await call(tok("teacherB"), "POST", "/requests", { type: "lesson-cancellation", lessonId: done, reason: "x" }), 403, "request on another teacher's lesson");
  expectStatus(await call(tok("managerA"), "POST", "/requests", { type: "lesson-cancellation", teacherId: uid("teacherA"), lessonId: "00000000-0000-4000-8000-000000000000", reason: "x" }), 404, "request on unknown lesson");
}

async function creditsScenario(): Promise<void> {
  const before = await balance("studentA");
  const purchase = await call(tok("studentA"), "POST", "/credits", { studentId: uid("studentA"), hours: 2, reason: "purchase", description: "Smoke purchase" });
  expectStatus(purchase, 201, "student purchases own credits");
  check(typeof obj(purchase.body, "credit").hours === "number", "POST /credits hours must be a number");
  check(near(await balance("studentA"), before + 2), "purchase must add exactly 2");
  await expectOneActivity("credit", str(purchase.body, "id"), "credits.purchased");
  expectStatus(await call(tok("studentA"), "POST", "/credits", { studentId: uid("studentB"), hours: 1, reason: "purchase", description: "x" }), 403, "student buys for another");
  expectStatus(await call(tok("studentA"), "POST", "/credits", { studentId: uid("studentA"), hours: 1, reason: "adjustment", description: "x" }), 403, "student adjusts own credits");
  expectStatus(await call(tok("teacherA"), "POST", "/credits", { studentId: uid("studentA"), hours: 1, reason: "adjustment", description: "x" }), 403, "teacher adjusts credits");
  // Known gap, asserted as current behavior: a student may self-purchase up to 100 with no payment check.
  const cap = await call(tok("studentA"), "POST", "/credits", { studentId: uid("studentA"), hours: 101, reason: "purchase", description: "x" });
  expectStatus(cap, 400, "purchase above the 100 cap");

  const beforeB = await balance("studentB");
  const adjust = await call(tok("admin"), "POST", "/credits", { studentId: uid("studentB"), hours: 0.5, reason: "adjustment", description: "Smoke fractional" });
  expectStatus(adjust, 201, "admin fractional adjustment");
  check(near(await balance("studentB"), beforeB + 0.5), "fractional adjustment must be exact (+0.5)");
  await expectOneActivity("credit", str(adjust.body, "id"), "credits.adjusted");
  expectStatus(await call(tok("managerA"), "POST", "/credits", { studentId: uid("studentB"), hours: 1, reason: "adjustment", description: "x" }), 403, "cross-team manager adjusts");
  const beforeA = await balance("studentA");
  expectStatus(await call(tok("managerA"), "POST", "/credits", { studentId: uid("studentA"), hours: -0.5, reason: "adjustment", description: "Smoke manager" }), 201, "own-team manager adjusts");
  check(near(await balance("studentA"), beforeA - 0.5), "manager adjustment must be exact (-0.5)");
  expectStatus(await call(tok("studentB"), "GET", `/credits/balance/${uid("studentA")}`), 403, "student reads another balance");

  // Balance equals the ledger sum; every hours value is a JSON number.
  const ledger = await call(tok("admin"), "GET", `/credits?studentId=${uid("studentA")}&limit=100`);
  expectStatus(ledger, 200, "ledger list");
  const items = arr(obj(ledger.body, "ledger").items, "ledger.items");
  check(num(ledger.body, "total") === items.length, "ledger fixture exceeds one page");
  let sum = 0;
  for (const item of items) {
    const hours = obj(item, "entry").hours;
    check(typeof hours === "number", `ledger hours must be a number, got ${typeof hours}`);
    sum += hours as number;
  }
  const finalBalance = await balance("studentA");
  check(near(Math.round(sum * 100) / 100, finalBalance), `balance ${finalBalance} != ledger sum ${sum}`);

  // Student shell bootstrap: numeric hours, version, same balance.
  const boot = await call(tok("studentA"), "GET", "/school/bootstrap");
  expectStatus(boot, 200, "student bootstrap");
  const credits = obj(obj(obj(boot.body, "bootstrap").collections, "collections").credits, "credits");
  let bootSum = 0;
  for (const entry of Object.values(credits)) {
    const hours = obj(entry, "credit").hours;
    check(typeof hours === "number", `bootstrap credit hours must be a number, got ${typeof hours}`);
    bootSum += hours as number;
  }
  check(near(Math.round(bootSum * 100) / 100, finalBalance), `bootstrap credit sum ${bootSum} != balance ${finalBalance}`);
}

async function homeworkScenario(): Promise<void> {
  const body = { studentId: uid("studentA"), title: "Smoke homework", type: "writing", dueLabel: "Friday" };
  expectStatus(await call(tok("studentA"), "POST", "/assignments", body), 403, "student assigns");
  expectStatus(await call(tok("managerB"), "POST", "/assignments", { ...body, teacherId: uid("teacherA") }), 403, "cross-team manager assigns");
  const created = await call(tok("teacherA"), "POST", "/assignments", body);
  expectStatus(created, 201, "teacher assigns");
  const id = str(created.body, "id");
  await expectOneActivity("assignment", id, "homework.assigned");
  expectStatus(await call(tok("studentB"), "POST", `/assignments/${id}/submit`, { response: "x" }), 403, "other student submits");
  expectStatus(await call(tok("studentA"), "POST", `/assignments/${id}/submit`, { response: "" }), 400, "empty submission");
  expectStatus(await call(tok("studentA"), "POST", `/assignments/${id}/submit`, { response: "My answer" }), 200, "student submits");
  await expectOneActivity("assignment", id, "homework.submitted");
  expectStatus(await call(tok("managerB"), "POST", `/assignments/${id}/review`, { feedback: "x" }), 403, "cross-team manager reviews");
  expectStatus(await call(tok("teacherB"), "POST", `/assignments/${id}/review`, { feedback: "x" }), 403, "other teacher reviews");
  expectStatus(await call(tok("teacherA"), "POST", `/assignments/${id}/review`, { feedback: "Good", grade: "A" }), 200, "teacher reviews");
  await expectOneActivity("assignment", id, "homework.reviewed");
  expectStatus(await call(tok("teacherA"), "POST", `/assignments/${id}/review`, { feedback: "Again" }), 400, "review twice");
}

async function qualityScenario(): Promise<void> {
  check(completedLessonId !== "", "quality needs the completed lesson from the lessons scenario");
  const path = `/lessons/${completedLessonId}/ratings`;
  expectStatus(await call(tok("studentB"), "POST", path, { score: 5, from: "student" }), 403, "other student rates");
  expectStatus(await call(tok("studentA"), "POST", path, { score: 6, from: "student" }), 400, "score above 5");
  expectStatus(await call(tok("studentA"), "POST", path, { score: 0, from: "student" }), 400, "score below 1");
  expectStatus(await call(tok("studentA"), "POST", path, { score: 5, from: "student", comment: "Great" }), 201, "student rates");
  await expectOneActivity("lesson", completedLessonId, "lesson.rated");
  expectStatus(await call(tok("studentA"), "POST", path, { score: 4, from: "student" }), 409, "duplicate rating");
  const upcoming = await scheduleLesson(tok("teacherA"), uid("teacherA"), uid("studentA"), nextSlot(14));
  expectStatus(await call(tok("studentA"), "POST", `/lessons/${upcoming}/ratings`, { score: 5, from: "student" }), 400, "rate a non-completed lesson");
}

async function profileScenario(): Promise<void> {
  for (const label of ["admin", "managerA", "teacherA", "studentA"]) {
    const res = await call(tok(label), "PATCH", `/users/${uid(label)}`, { name: `Smoke ${label} renamed ${runId}` });
    expectStatus(res, 200, `${label} renames self`);
    await expectOneActivity("user", uid(label), "user.renamed");
  }
  expectStatus(await call(tok("teacherA"), "PATCH", `/users/${uid("studentA")}`, { name: "x" }), 403, "teacher renames student");
  expectStatus(await call(tok("studentA"), "PATCH", `/users/${uid("teacherA")}`, { name: "x" }), 403, "student renames teacher");
  expectStatus(await call(tok("managerA"), "PATCH", `/users/${uid("managerB")}`, { name: "x" }), 403, "manager renames manager");
  expectStatus(await call(tok("teacherA"), "PATCH", `/users/${uid("teacherA")}`, { status: "paused" }), 403, "teacher changes own status");
  expectStatus(await call(tok("admin"), "PATCH", `/users/${uid("studentZero")}`, { status: "paused" }), 200, "admin pauses a student");
  await expectOneActivity("user", uid("studentZero"), "user.paused");
}

// ---------------------------------------------------------------- runner

type Outcome = { domain: string; checks: number; error?: string };
const outcomes: Outcome[] = [];

async function scenario(domain: string, body: () => Promise<void>): Promise<void> {
  const start = checkCount;
  try {
    await body();
    outcomes.push({ domain, checks: checkCount - start });
    console.log(`PASS ${domain} (${checkCount - start} checks)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outcomes.push({ domain, checks: checkCount - start, error: message });
    console.log(`FAIL ${domain}: ${message}`);
  }
}

async function main(): Promise<number> {
  console.log(`Lumina API smoke run ${runId} on ${base} (db host ${dbHost})`);
  app = await buildApp({ env });
  try {
    await app.listen({ host: "127.0.0.1", port });
  } catch (error) {
    console.error(`SMOKE FAILED: could not listen on 127.0.0.1:${port} (in use?)`, error);
    return 1;
  }

  try {
    await setup();
  } catch (error) {
    console.error("SMOKE FAILED during setup:", error instanceof Error ? error.message : error);
    return 1;
  }

  await scenario("settings", settingsScenario);
  await scenario("slots", slotsScenario);
  await scenario("booking", bookingScenario);
  await scenario("on-behalf", onBehalfScenario);
  await scenario("rebook", rebookScenario);
  await scenario("lessons", lessonsScenario);
  await scenario("requests", requestsScenario);
  await scenario("credits", creditsScenario);
  await scenario("homework", homeworkScenario);
  await scenario("quality", qualityScenario);
  await scenario("profile", profileScenario);

  const failed = outcomes.filter((outcome) => outcome.error);
  const total = outcomes.reduce((sum, outcome) => sum + outcome.checks, 0);
  console.log(
    `\nSMOKE ${failed.length ? "FAILED" : "PASSED"}: ${outcomes.length - failed.length}/${outcomes.length} domains, ${total} checks`,
  );
  return failed.length ? 1 : 0;
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  console.error("SMOKE FAILED:", error);
  exitCode = 1;
} finally {
  await cleanup();
}
process.exit(exitCode);
