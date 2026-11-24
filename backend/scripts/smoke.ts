/**
 * API smoke test: proves every school domain end to end against the local Postgres.
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
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { loadEnv } from "../src/config/env";
import * as schema from "../src/db/schema";
import { attachments, creditEntries, lessonPlans, lessons, libraryItems, refreshTokens, settings, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { addMinutes, LESSON_MINUTES } from "../src/lib/time";

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
  AUTH_RATE_LIMIT_MAX: "100000",
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
  // Library items created by smoke users are archived (never deleted) so they do not stay
  // published in the shared dev library for real managers.
  try {
    await db
      .update(libraryItems)
      .set({ status: "archived" })
      .where(
        inArray(
          libraryItems.createdBy,
          db.select({ id: users.id }).from(users).where(like(users.email, `smoke-${runId}-%`)),
        ),
      );
  } catch (error) {
    console.error("Could not archive smoke library items (best effort):", error);
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
function fieldArr(value: unknown, key: string): unknown[] {
  const field = obj(value, key)[key];
  if (!Array.isArray(field)) throw new Error(`expected array "${key}", got ${JSON.stringify(field)}`);
  return field;
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

async function upload(token: string | null, file: { name: string; type: string; bytes: Uint8Array }): Promise<Res> {
  const form = new FormData();
  form.append("file", new Blob([file.bytes], { type: file.type }), file.name);
  return call(token, "POST", "/uploads", form);
}

async function download(token: string | null, id: string): Promise<{ status: number; bytes: Uint8Array }> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}/uploads/${id}/download`, { headers });
  return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()) };
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

/**
 * Lesson inserted straight into the DB, with no ledger entry unless the test adds
 * one. No API can create an uncharged lesson, and RFC-003 is exactly about that
 * case: a cancellation must never mint credit for a lesson nobody paid for.
 */
async function insertProbeLesson(input: {
  teacherLabel: string;
  studentLabel: string;
  days: number;
}): Promise<string> {
  const slot = nextSlot(input.days);
  const [row] = await db
    .insert(lessons)
    .values({
      teacherId: uid(input.teacherLabel),
      studentId: uid(input.studentLabel),
      enrollmentId: enrollmentId || null,
      date: slot.date,
      time: slot.time,
      endTime: addMinutes(slot.time, LESSON_MINUTES),
      title: `Smoke refund probe ${runId}`,
      status: "scheduled",
      createdBy: adminId!,
    })
    .returning({ id: lessons.id });
  if (!row) throw new Error("could not insert a probe lesson");
  return row.id;
}

async function insertProbeLedger(input: {
  studentLabel: string;
  hours: number;
  reason: "booking" | "adjustment";
  lessonId: string;
  description: string;
}): Promise<void> {
  await db.insert(creditEntries).values({
    studentId: uid(input.studentLabel),
    hours: input.hours,
    reason: input.reason,
    description: input.description,
    lessonId: input.lessonId,
    actorId: adminId!,
  });
}

/** Refund rows written against one lesson (the thing RFC-003 must control). */
async function refundRows(lessonId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(creditEntries)
    .where(
      and(
        eq(creditEntries.lessonId, lessonId),
        eq(creditEntries.reason, "refund"),
      ),
    );
  return Number(row?.value ?? 0);
}

let enrollmentId = "";
let firstPlanId = "";
let courseId = "";
let unitId = "";

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
  courseId = str(course.body, "id");
  const unit = await call(tok("managerA"), "POST", `/courses/${courseId}/units`, { title: "Unit 1", order: 0 });
  expectStatus(unit, 201, "create unit");
  unitId = str(unit.body, "id");
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
  await addCredits("studentR", 2.5);
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
  check(near(await balance("studentA"), before - 1), "POST /lessons debits one credit");
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
  form.append("file", new Blob(["%PDF-1.4 smoke attachment"], { type: "application/pdf" }), "smoke-note.pdf");
  const upload = await call(tok("teacherA"), "POST", "/uploads", form);
  expectStatus(upload, 201, "upload attachment");
  const attachmentId = str(upload.body, "id");
  const cancelReq = await call(tok("teacherA"), "POST", "/requests", { type: "lesson-cancellation", lessonId, reason: "Smoke sick day", attachmentId });
  expectStatus(cancelReq, 201, "create cancellation request");
  const cancelId = str(cancelReq.body, "id");
  check(obj(cancelReq.body, "request").attachmentId === attachmentId, "request did not keep attachmentId");
  const readBack = await call(tok("managerA"), "GET", `/uploads/${attachmentId}`);
  expectStatus(readBack, 200, "read attachment back");
  check(str(readBack.body, "name") === "smoke-note.pdf", "attachment name read-back");
  expectStatus(await call(tok("admin"), "GET", `/uploads/${attachmentId}`), 200, "admin reads request attachment");
  expectStatus(await call(tok("managerB"), "GET", `/uploads/${attachmentId}`), 403, "cross-team manager reads request attachment");
  check((await download(tok("managerB"), attachmentId)).status === 403, "cross-team manager downloads request attachment");
  expectStatus(await call(tok("studentA"), "GET", `/uploads/${attachmentId}`), 403, "student reads teacher request attachment");
  check((await download(tok("studentA"), attachmentId)).status === 403, "student downloads teacher request attachment");
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
  // Staff-managed credits policy (Phase 02): students cannot self-purchase in API mode.
  expectStatus(await call(tok("studentA"), "POST", "/credits", { studentId: uid("studentA"), hours: 2, reason: "purchase", description: "Smoke self-purchase blocked" }), 403, "student self-purchase refused");
  check(near(await balance("studentA"), before), "refused student purchase must not change balance");
  expectStatus(await call(tok("studentA"), "POST", "/credits", { studentId: uid("studentB"), hours: 1, reason: "purchase", description: "x" }), 403, "student buys for another");
  expectStatus(await call(tok("studentA"), "POST", "/credits", { studentId: uid("studentA"), hours: 1, reason: "adjustment", description: "x" }), 403, "student adjusts own credits");
  expectStatus(await call(tok("teacherA"), "POST", "/credits", { studentId: uid("studentA"), hours: 1, reason: "adjustment", description: "x" }), 403, "teacher adjusts credits");

  const purchase = await call(tok("admin"), "POST", "/credits", { studentId: uid("studentA"), hours: 2, reason: "purchase", description: "Smoke admin purchase" });
  expectStatus(purchase, 201, "admin records purchase credits");
  check(typeof obj(purchase.body, "credit").hours === "number", "POST /credits hours must be a number");
  check(near(await balance("studentA"), before + 2), "purchase must add exactly 2");
  await expectOneActivity("credit", str(purchase.body, "id"), "credits.purchased");
  const cap = await call(tok("admin"), "POST", "/credits", { studentId: uid("studentA"), hours: 101, reason: "purchase", description: "x" });
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

/**
 * RFC-003 refund evidence: a refund requires a `booking` debit for the same
 * lesson and student, and that charge must still be net-negative. Every path
 * (student cancel, teacher absence, manager approval) is checked against an
 * uncharged lesson, a reversed charge, and a charged control.
 */
async function refundEvidenceScenario(): Promise<void> {
  // 1. Never charged: cancellation must not mint a credit.
  const uncharged = await insertProbeLesson({ teacherLabel: "teacherA", studentLabel: "studentA", days: 30 });
  const balanceBefore = await balance("studentA");
  const cancelled = await call(tok("studentA"), "POST", `/lessons/${uncharged}/cancel`, {});
  expectStatus(cancelled, 200, "cancel an uncharged lesson");
  check(obj(cancelled.body, "cancel").refunded === false, "an uncharged lesson must not refund");
  check(near(await balance("studentA"), balanceBefore), "an uncharged cancellation must not move the balance");
  check((await refundRows(uncharged)) === 0, "no refund row for an uncharged lesson");

  // 2. Charge reversed by an adjustment: still not refundable.
  const reversed = await insertProbeLesson({ teacherLabel: "teacherA", studentLabel: "studentA", days: 31 });
  await insertProbeLedger({ studentLabel: "studentA", hours: -1, reason: "booking", lessonId: reversed, description: "Smoke refund probe charge" });
  await insertProbeLedger({ studentLabel: "studentA", hours: 1, reason: "adjustment", lessonId: reversed, description: "Smoke refund probe reversal" });
  const cancelledReversed = await call(tok("studentA"), "POST", `/lessons/${reversed}/cancel`, {});
  expectStatus(cancelledReversed, 200, "cancel a reversed charge");
  check(obj(cancelledReversed.body, "cancel").refunded === false, "a reversed charge must not refund");
  check((await refundRows(reversed)) === 0, "no refund row for a reversed charge");

  // 3. Control: a charged lesson refunds exactly once.
  const charged = await insertProbeLesson({ teacherLabel: "teacherA", studentLabel: "studentA", days: 32 });
  await insertProbeLedger({ studentLabel: "studentA", hours: -1, reason: "booking", lessonId: charged, description: "Smoke refund probe charge" });
  const beforeCharged = await balance("studentA");
  const cancelledCharged = await call(tok("studentA"), "POST", `/lessons/${charged}/cancel`, {});
  expectStatus(cancelledCharged, 200, "cancel a charged lesson");
  check(obj(cancelledCharged.body, "cancel").refunded === true, "a charged lesson must refund");
  check(near(await balance("studentA"), beforeCharged + 1), "the refund must add exactly one credit");
  check((await refundRows(charged)) === 1, "exactly one refund row for a charged lesson");

  // 4. Absence on an uncharged lesson: recorded, never refunded.
  const absent = await insertProbeLesson({ teacherLabel: "teacherA", studentLabel: "studentA", days: -1 });
  const absence = await call(tok("admin"), "POST", `/lessons/${absent}/absence`, { note: `Smoke uncharged absence ${runId}` });
  expectStatus(absence, 201, "record absence on an uncharged lesson");
  check((await refundRows(absent)) === 0, "no refund row for an uncharged absence");

  // 5. Manager approval on an uncharged lesson: cancelled, never refunded.
  const pending = await insertProbeLesson({ teacherLabel: "teacherA", studentLabel: "studentA", days: 33 });
  const request = await call(tok("teacherA"), "POST", "/requests", { type: "lesson-cancellation", lessonId: pending, reason: "Smoke uncharged approval" });
  expectStatus(request, 201, "teacher requests cancellation for an uncharged lesson");
  const approved = await call(tok("managerA"), "POST", `/requests/${str(request.body, "id")}/review`, { status: "approved" });
  expectStatus(approved, 200, "approve the uncharged cancellation");
  check((await refundRows(pending)) === 0, "approval of an uncharged lesson must not refund");
  check(str(await getLesson(pending), "status") === "cancelled", "approval still cancels the lesson");
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

async function uploadsScenario(): Promise<void> {
  const content = new TextEncoder().encode(`smoke upload ${runId}`);
  const uploaded = await upload(tok("managerA"), { name: "smoke-plan.pdf", type: "application/pdf", bytes: content });
  expectStatus(uploaded, 201, "manager uploads a plan file");
  const id = str(uploaded.body, "id");
  check(str(uploaded.body, "name") === "smoke-plan.pdf", "upload keeps the file name");
  check(num(uploaded.body, "size") === content.length, "upload reports the exact byte size");

  expectStatus(await call(tok("managerA"), "GET", `/uploads/${id}`), 200, "read attachment metadata");
  expectStatus(await call(tok("admin"), "GET", `/uploads/${id}`), 200, "admin reads unattached upload");
  expectStatus(await call(tok("managerB"), "GET", `/uploads/${id}`), 403, "other manager blocked from unattached upload");
  check((await download(tok("managerB"), id)).status === 403, "other manager download blocked before attach");
  expectStatus(await call(tok("studentA"), "GET", `/uploads/${id}`), 403, "student blocked from unattached upload");
  check((await download(tok("studentA"), id)).status === 403, "student download blocked before attach");
  const bytes = await download(tok("managerA"), id);
  check(bytes.status === 200, `download expected 200, got ${bytes.status}`);
  check(bytes.bytes.length === content.length, `download length ${bytes.bytes.length} != ${content.length}`);
  check(Buffer.compare(Buffer.from(bytes.bytes), Buffer.from(content)) === 0, "download returns the same bytes");

  const planAttachPath = `/courses/${courseId}/units/${unitId}/plans/${firstPlanId}/attachments`;
  const attach = await call(tok("managerA"), "POST", planAttachPath, { attachmentId: id });
  expectStatus(attach, 200, "attach upload to a plan");

  // Published course plan attachment: enrolled student/teacher and any manager allowed; unrelated student/teacher denied.
  expectStatus(await call(tok("studentA"), "GET", `/uploads/${id}`), 200, "enrolled student reads plan attachment");
  const studentBytes = await download(tok("studentA"), id);
  check(studentBytes.status === 200 && Buffer.compare(Buffer.from(studentBytes.bytes), Buffer.from(content)) === 0, "enrolled student downloads identical plan bytes");
  expectStatus(await call(tok("teacherA"), "GET", `/uploads/${id}`), 200, "enrolled teacher reads plan attachment");
  expectStatus(await call(tok("managerB"), "GET", `/uploads/${id}`), 200, "other manager reads published course plan attachment");
  expectStatus(await call(tok("studentB"), "GET", `/uploads/${id}`), 403, "unrelated student blocked from plan attachment");
  check((await download(tok("studentB"), id)).status === 403, "unrelated student download blocked");
  expectStatus(await call(tok("teacherB"), "GET", `/uploads/${id}`), 403, "unrelated teacher blocked from plan attachment");
  check((await download(tok("teacherB"), id)).status === 403, "unrelated teacher download blocked");

  // Draft course plan attachment: owner + admin allowed; other manager + students blocked.
  const draftCourse = await call(tok("managerA"), "POST", "/courses", { title: `Smoke draft ${runId}`, level: "A2", status: "draft" });
  expectStatus(draftCourse, 201, "create draft course");
  const draftCourseId = str(draftCourse.body, "id");
  const draftUnit = await call(tok("managerA"), "POST", `/courses/${draftCourseId}/units`, { title: "Draft Unit 1", order: 0 });
  expectStatus(draftUnit, 201, "create draft unit");
  const draftPlan = await call(tok("managerA"), "POST", `/courses/${draftCourseId}/units/${str(draftUnit.body, "id")}/plans`, { title: "Draft Plan 1", order: 0 });
  expectStatus(draftPlan, 201, "create draft plan");
  const draftUpload = await upload(tok("managerA"), { name: "draft-only.pdf", type: "application/pdf", bytes: content });
  expectStatus(draftUpload, 201, "upload draft plan file");
  const draftAttachmentId = str(draftUpload.body, "id");
  expectStatus(await call(tok("managerA"), "POST", `/courses/${draftCourseId}/units/${str(draftUnit.body, "id")}/plans/${str(draftPlan.body, "id")}/attachments`, {
    attachmentId: draftAttachmentId,
  }), 200, "attach file to draft plan");
  expectStatus(await call(tok("admin"), "GET", `/uploads/${draftAttachmentId}`), 200, "admin reads draft course attachment");
  expectStatus(await call(tok("managerB"), "GET", `/uploads/${draftAttachmentId}`), 403, "other manager blocked from draft course attachment");
  check((await download(tok("managerB"), draftAttachmentId)).status === 403, "other manager blocked from draft course download");
  expectStatus(await call(tok("studentA"), "GET", `/uploads/${draftAttachmentId}`), 403, "student blocked from draft course attachment");

  expectStatus(await call(null, "GET", `/uploads/${id}`), 401, "anonymous reads attachment");
  check((await download(null, id)).status === 401, "anonymous download is refused");
  expectStatus(await upload(null, { name: "x.pdf", type: "application/pdf", bytes: content }), 401, "anonymous uploads");
  expectStatus(await upload(tok("managerA"), { name: "run.exe", type: "application/octet-stream", bytes: content }), 400, "unsupported file type");
  expectStatus(await upload(tok("managerA"), { name: "empty.pdf", type: "application/pdf", bytes: new Uint8Array() }), 400, "empty upload");
  const oversized = await upload(tok("managerA"), { name: "big.pdf", type: "application/pdf", bytes: new Uint8Array(5 * 1024 * 1024 + 1) });
  check(oversized.status === 413 || oversized.status === 400, `oversized upload rejected (got ${oversized.status})`);

  // Current behavior: uploads write no activity row of their own.
  await expectNoActivity("attachment", id, "attachment.uploaded");

  await planAttachRulesChecks(id, content);
  await traversalCanaryCheck(id);
}

/** Plan attach takes only `{ attachmentId }` of an existing upload (Step F, F1.1). */
async function planAttachRulesChecks(attachedId: string, content: Uint8Array): Promise<void> {
  const errorCode = (res: Res) => str(obj(res.body, "error").error, "code");
  const planAttachPath = `/courses/${courseId}/units/${unitId}/plans/${firstPlanId}/attachments`;

  // (a) managerB can edit their own plan but cannot attach managerA's upload to it.
  const courseB = await call(tok("managerB"), "POST", "/courses", { title: `Smoke B course ${runId}`, level: "A1", status: "draft" });
  expectStatus(courseB, 201, "managerB creates a course");
  const courseBId = str(courseB.body, "id");
  const unitB = await call(tok("managerB"), "POST", `/courses/${courseBId}/units`, { title: "B Unit 1", order: 0 });
  expectStatus(unitB, 201, "managerB creates a unit");
  const unitBId = str(unitB.body, "id");
  const planB = await call(tok("managerB"), "POST", `/courses/${courseBId}/units/${unitBId}/plans`, { title: "B Plan 1", order: 0 });
  expectStatus(planB, 201, "managerB creates a plan");
  const planBPath = `/courses/${courseBId}/units/${unitBId}/plans/${str(planB.body, "id")}/attachments`;
  const ownB = await upload(tok("managerB"), { name: "b-own.pdf", type: "application/pdf", bytes: content });
  expectStatus(ownB, 201, "managerB uploads own file");
  expectStatus(await call(tok("managerB"), "POST", planBPath, { attachmentId: str(ownB.body, "id") }), 200, "managerB attaches own upload to own plan");
  expectStatus(await call(tok("managerB"), "POST", planBPath, { attachmentId: attachedId }), 403, "managerB attaches managerA's upload");

  // (b) unknown attachment id.
  expectStatus(await call(tok("managerA"), "POST", planAttachPath, { attachmentId: randomUUID() }), 404, "attach an unknown attachment id");

  // (c) client file metadata and legacy shapes are rejected by the strict body.
  const clientId = randomUUID();
  const shapes: Array<[string, unknown]> = [
    ["attachmentId + storageKey", { attachmentId: attachedId, storageKey: `../smoke-evil-${runId}` }],
    ["legacy file shape", { id: clientId, name: "x.pdf", type: "application/pdf", size: 1, storageKey: `smoke-evil-legacy-${runId}` }],
    ["empty body", {}],
  ];
  for (const [label, body] of shapes) {
    const res = await call(tok("managerA"), "POST", planAttachPath, body);
    expectStatus(res, 400, `plan attach rejects ${label}`);
    check(errorCode(res) === "VALIDATION_ERROR", `plan attach ${label} error code ${JSON.stringify(res.body)}`);
  }

  // (d) request evidence cannot be attached to a plan.
  const reqLesson = await insertLibraryLesson("teacherA", "studentA", "scheduled");
  const evidence = await upload(tok("managerA"), { name: "plan-evidence.pdf", type: "application/pdf", bytes: content });
  expectStatus(evidence, 201, "upload a file that becomes request evidence");
  const evidenceId = str(evidence.body, "id");
  const request = await call(tok("teacherA"), "POST", "/requests", { type: "lesson-cancellation", lessonId: reqLesson, reason: "Smoke plan evidence", attachmentId: evidenceId });
  expectStatus(request, 201, "teacher files request citing the upload");
  const evidenceAttach = await call(tok("managerA"), "POST", planAttachPath, { attachmentId: evidenceId });
  expectStatus(evidenceAttach, 422, "attach request evidence to a plan");
  check(errorCode(evidenceAttach) === "ATTACHMENT_NOT_ELIGIBLE", `request evidence attach error code ${JSON.stringify(evidenceAttach.body)}`);

  // (e) admin attaches any upload to any plan.
  expectStatus(await call(tok("admin"), "POST", planBPath, { attachmentId: attachedId }), 200, "admin attaches another user's upload");

  // (f) the route created no attachments rows for client-supplied ids or keys.
  const [stray] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(attachments)
    .where(sql`${attachments.storageKey} like ${`%smoke-evil-%${runId}%`} or ${attachments.id} = ${clientId}`);
  check(stray?.n === 0, `plan attach created no attachments rows for client keys (got ${stray?.n})`);
  const [plan] = await db.select({ ids: lessonPlans.attachmentIds }).from(lessonPlans).where(eq(lessonPlans.id, firstPlanId));
  check(JSON.stringify(plan?.ids) === JSON.stringify([attachedId]), `plan holds only the legitimately attached id (got ${JSON.stringify(plan?.ids)})`);
}

/**
 * A stored key that escapes UPLOAD_DIR is refused with 404 (Step F, F1.3). Uses a canary
 * file in the system temp dir (outside the upload dir and the repo), never a real secret.
 */
async function traversalCanaryCheck(controlId: string): Promise<void> {
  const canaryName = `smoke-canary-${runId}.txt`;
  const canaryPath = join(uploadDir, "..", canaryName);
  const sentinel = `CANARY-${runId}`;
  let rowId: string | undefined;
  try {
    writeFileSync(canaryPath, sentinel);
    const [row] = await db
      .insert(attachments)
      .values({
        name: `smoke-traversal-${runId}.txt`,
        type: "text/plain",
        size: sentinel.length,
        storageKey: `../${canaryName}`,
        uploadedBy: adminId!,
      })
      .returning({ id: attachments.id });
    rowId = row?.id;
    if (!rowId) throw new Error("could not insert the traversal fixture row");
    const res = await download(tok("admin"), rowId);
    check(res.status === 404, `traversal key download expected 404, got ${res.status}`);
    check(!Buffer.from(res.bytes).toString("utf8").includes(sentinel), "traversal download leaks no canary content");
    check((await download(tok("admin"), controlId)).status === 200, "legitimate upload still downloads");
  } finally {
    if (rowId) await db.delete(attachments).where(eq(attachments.id, rowId)).catch(() => undefined);
    rmSync(canaryPath, { force: true });
  }
}

async function notificationsScenario(): Promise<void> {
  const initial = await call(tok("studentA"), "GET", "/notifications/state");
  expectStatus(initial, 200, "read notification state");
  check(fieldArr(initial.body, "readIds").length === 0, "new user starts with no read ids");

  const patched = await call(tok("studentA"), "PATCH", "/notifications/state", {
    mutedCategories: ["credits"], readIds: ["note-1", "note-2"],
  });
  expectStatus(patched, 200, "save notification state");
  check(fieldArr(patched.body, "mutedCategories").includes("credits"), "saved muted category returned");
  check(fieldArr(patched.body, "readIds").length === 2, "saved read ids returned");

  const reread = await call(tok("studentA"), "GET", "/notifications/state");
  expectStatus(reread, 200, "read state after save");
  check(JSON.stringify(fieldArr(reread.body, "readIds")) === JSON.stringify(["note-1", "note-2"]), "read ids persisted");

  const other = await call(tok("studentZero"), "GET", "/notifications/state");
  expectStatus(other, 200, "read another user's state");
  check(fieldArr(other.body, "readIds").length === 0, "notification state is per user");

  const partial = await call(tok("studentA"), "PATCH", "/notifications/state", { readIds: ["note-3"] });
  expectStatus(partial, 200, "partial state update");
  check(JSON.stringify(fieldArr(partial.body, "mutedCategories")) === JSON.stringify(["credits"]), "partial update keeps muted categories");

  const many = Array.from({ length: 350 }, (_, index) => `id-${index}`);
  const capped = await call(tok("studentA"), "PATCH", "/notifications/state", { readIds: many });
  expectStatus(capped, 200, "save more than 300 read ids");
  const cappedIds = fieldArr(capped.body, "readIds");
  check(cappedIds.length === 300, `read ids capped at 300, got ${cappedIds.length}`);
  check(cappedIds[299] === "id-349", "the cap keeps the newest read ids");

  expectStatus(await call(tok("studentA"), "PATCH", "/notifications/state", { mutedCategories: ["nope"] }), 400, "invalid muted category");
  expectStatus(await call(null, "GET", "/notifications/state"), 401, "anonymous reads state");
  expectStatus(await call(null, "PATCH", "/notifications/state", { readIds: [] }), 401, "anonymous writes state");

  // The feed is actor-or-target scoped. profileScenario renamed studentA, so the admin's
  // user.renamed row targets this student and must be visible.
  const feed = await call(tok("studentA"), "GET", "/notifications?limit=100");
  expectStatus(feed, 200, "notification feed");
  const items = fieldArr(feed.body, "items");
  check(items.length > 0, "feed has rows for the signed-in user");

  const foreign = await call(tok("studentB"), "GET", "/notifications?limit=100");
  expectStatus(foreign, 200, "another user's feed");
  const ownIds = new Set(items.map((item) => str(item, "id")));
  check(
    !fieldArr(foreign.body, "items").some((item) => ownIds.has(str(item, "id"))),
    "feeds are scoped per user",
  );
}

// The auth domain mutates passwords, so it runs on its own fixture user (never on
// the shared fixtures whose `password` other domains reuse). The user is archived
// with the other smoke users; fabricated refresh-token rows are removed in finally.
type Session = { status: number; body: unknown; token: string; cookie: string; setCookie: string };

async function authCall(input: { path: string; body?: unknown; token?: string; cookie?: string }): Promise<Session> {
  const headers: Record<string, string> = {};
  if (input.token) headers.Authorization = `Bearer ${input.token}`;
  if (input.cookie) headers.Cookie = `refresh_token=${input.cookie}`;
  if (input.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${base}${input.path}`, {
    method: "POST",
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  const setCookie = response.headers.getSetCookie().find((value) => value.startsWith("refresh_token=")) ?? "";
  const cookie = setCookie ? (setCookie.split(";")[0] ?? "").slice("refresh_token=".length) : "";
  const token = typeof body === "object" && body !== null && typeof (body as { accessToken?: unknown }).accessToken === "string"
    ? (body as { accessToken: string }).accessToken
    : "";
  return { status: response.status, body, token, cookie, setCookie };
}

async function signIn(email: string, pw: string, label: string): Promise<Session> {
  const session = await authCall({ path: "/auth/login", body: { email, password: pw } });
  expectStatus(session, 200, label);
  check(session.token !== "" && session.cookie !== "", `${label}: expected an access token and a refresh cookie`);
  return session;
}

function errorCode(res: { body: unknown }): unknown {
  const error = obj(res.body, "error body").error;
  return typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
}

async function activeTokenCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  return rows.length;
}

async function authScenario(): Promise<void> {
  const email = emailFor("pwuser");
  const created = await call(tok("admin"), "POST", "/users", {
    name: `Smoke pwuser ${runId}`,
    email,
    password,
    role: "student",
    managerId: uid("managerA"),
  });
  expectStatus(created, 201, "create password fixture user");
  const userId = str(created.body, "id");
  const changed = randomBytes(18).toString("base64url");
  const reset = randomBytes(18).toString("base64url");
  const fabricated: string[] = [];

  try {
    // ---- change-password
    const a = await signIn(email, password, "pwuser signs in (device A)");
    const b = await signIn(email, password, "pwuser signs in (device B)");

    const wrong = await authCall({
      path: "/auth/change-password",
      token: a.token,
      cookie: a.cookie,
      body: { currentPassword: `${password}-wrong`, newPassword: changed },
    });
    check(wrong.status !== 401, `wrong current password must not be 401 (client would refresh), got ${wrong.status}`);
    expectStatus(wrong, 400, "wrong current password");
    check(errorCode(wrong) === "INVALID_CURRENT_PASSWORD", `wrong current password code: ${JSON.stringify(wrong.body)}`);

    const same = await authCall({
      path: "/auth/change-password",
      token: a.token,
      body: { currentPassword: password, newPassword: password },
    });
    expectStatus(same, 400, "new password equal to current");
    check(errorCode(same) === "VALIDATION_ERROR", `same password code: ${JSON.stringify(same.body)}`);

    const short = await authCall({
      path: "/auth/change-password",
      token: a.token,
      body: { currentPassword: password, newPassword: "short-pw" },
    });
    expectStatus(short, 400, "new password under 10 characters");

    const ok = await authCall({
      path: "/auth/change-password",
      token: a.token,
      cookie: a.cookie,
      body: { currentPassword: password, newPassword: changed },
    });
    expectStatus(ok, 200, "change password");
    check(JSON.stringify(ok.body) === JSON.stringify({ success: true }), `change password body: ${JSON.stringify(ok.body)}`);
    check(ok.cookie !== "" && ok.cookie !== a.cookie, "change password rotates the refresh cookie");
    const attrs = ok.setCookie.toLowerCase();
    check(attrs.includes("httponly"), `refresh cookie must be HttpOnly: ${ok.setCookie}`);
    check(attrs.includes("samesite=lax"), `refresh cookie must be SameSite=Lax: ${ok.setCookie}`);
    check(attrs.includes("path=/api/v1/auth"), `refresh cookie path: ${ok.setCookie}`);
    check(!ok.setCookie.includes(changed), "the new password never appears in the cookie");
    await expectOneActivity("user", userId, "user.password_changed");

    expectStatus(await authCall({ path: "/auth/refresh", cookie: b.cookie }), 401, "other device refresh after change");
    expectStatus(await authCall({ path: "/auth/refresh", cookie: a.cookie }), 401, "old cookie refresh after change");
    const rotated = await authCall({ path: "/auth/refresh", cookie: ok.cookie });
    expectStatus(rotated, 200, "new cookie refresh after change (device A stays signed in)");

    expectStatus(await authCall({ path: "/auth/login", body: { email, password } }), 401, "old password login after change");
    const c = await signIn(email, changed, "new password login after change");

    // ---- admin reset
    expectStatus(await call(tok("managerA"), "POST", `/users/${userId}/reset-password`, { newPassword: reset }), 403, "manager resets password");
    expectStatus(await call(tok("teacherA"), "POST", `/users/${userId}/reset-password`, { newPassword: reset }), 403, "teacher resets password");
    expectStatus(await call(c.token, "POST", `/users/${userId}/reset-password`, { newPassword: reset }), 403, "student resets own password via admin route");
    const selfReset = await call(tok("admin"), "POST", `/users/${uid("admin")}/reset-password`, { newPassword: reset });
    expectStatus(selfReset, 400, "admin self-reset");
    expectStatus(
      await call(tok("admin"), "POST", "/users/00000000-0000-4000-8000-000000000000/reset-password", { newPassword: reset }),
      404,
      "reset unknown user",
    );
    expectStatus(await call(tok("admin"), "POST", `/users/${userId}/reset-password`, { newPassword: "short-pw" }), 400, "reset with a short password");
    expectStatus(
      await call(tok("admin"), "POST", `/users/${userId}/reset-password`, { newPassword: reset, role: "admin" }),
      400,
      "reset rejects extra fields",
    );

    const resetRes = await call(tok("admin"), "POST", `/users/${userId}/reset-password`, { newPassword: reset });
    expectStatus(resetRes, 200, "admin resets password");
    check(str(resetRes.body, "id") === userId && obj(resetRes.body, "reset").success === true, `reset body: ${JSON.stringify(resetRes.body)}`);
    check(!JSON.stringify(resetRes.body).includes(reset), "reset response never echoes the password");
    await expectOneActivity("user", userId, "user.password_reset");
    expectStatus(await authCall({ path: "/auth/refresh", cookie: c.cookie }), 401, "target refresh after admin reset");
    expectStatus(await authCall({ path: "/auth/refresh", cookie: rotated.cookie }), 401, "target device A refresh after admin reset");
    check((await activeTokenCount(userId)) === 0, "admin reset revokes every target refresh token");
    expectStatus(await authCall({ path: "/auth/login", body: { email, password: changed } }), 401, "pre-reset password login");

    // ---- prune on login: expired + revoked > 7 days are deleted, fresh + recently revoked kept
    const day = 86_400_000;
    const now = Date.now();
    const rows = [
      { label: "expired", expiresAt: new Date(now - day), revokedAt: null },
      { label: "oldRevoked", expiresAt: new Date(now + 10 * day), revokedAt: new Date(now - 8 * day) },
      { label: "fresh", expiresAt: new Date(now + 10 * day), revokedAt: null },
      { label: "recentRevoked", expiresAt: new Date(now + 10 * day), revokedAt: new Date(now - day) },
    ];
    const ids: Record<string, string> = {};
    for (const row of rows) {
      const [inserted] = await db
        .insert(refreshTokens)
        .values({
          userId,
          tokenHash: createHash("sha256").update(`smoke-${runId}-${row.label}-${randomBytes(8).toString("hex")}`).digest("hex"),
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
        })
        .returning({ id: refreshTokens.id });
      if (!inserted) throw new Error(`could not insert the ${row.label} refresh token`);
      ids[row.label] = inserted.id;
      fabricated.push(inserted.id);
    }
    const d = await signIn(email, reset, "reset password login (runs the prune)");
    const left = await db
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(inArray(refreshTokens.id, fabricated));
    const remaining = new Set(left.map((row) => row.id));
    check(!remaining.has(ids.expired ?? ""), "prune deletes the expired token");
    check(!remaining.has(ids.oldRevoked ?? ""), "prune deletes the token revoked 8 days ago");
    check(remaining.has(ids.fresh ?? ""), "prune keeps the fresh token");
    check(remaining.has(ids.recentRevoked ?? ""), "prune keeps the token revoked 1 day ago");

    // ---- pause and archive revoke the target's tokens
    expectStatus(await call(tok("admin"), "PATCH", `/users/${userId}`, { status: "paused" }), 200, "admin pauses the password user");
    check((await activeTokenCount(userId)) === 0, "pause revokes every refresh token");
    expectStatus(await authCall({ path: "/auth/refresh", cookie: d.cookie }), 401, "refresh after pause");
    expectStatus(await call(tok("admin"), "PATCH", `/users/${userId}`, { status: "active" }), 200, "admin reactivates the password user");
    const e = await signIn(email, reset, "login after reactivation");
    expectStatus(await call(tok("admin"), "DELETE", `/users/${userId}`), 200, "admin archives the password user");
    check((await activeTokenCount(userId)) === 0, "archive revokes every refresh token");
    expectStatus(await authCall({ path: "/auth/refresh", cookie: e.cookie }), 401, "refresh after archive");
    expectStatus(await authCall({ path: "/auth/login", body: { email, password: reset } }), 401, "login after archive");
  } finally {
    if (fabricated.length) {
      await db.delete(refreshTokens).where(inArray(refreshTokens.id, fabricated)).catch((error: unknown) => {
        console.error("Could not remove fabricated refresh tokens (best effort):", error);
      });
    }
    await db.update(users).set({ status: "archived" }).where(eq(users.id, userId)).catch(() => undefined);
  }
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

/** Lesson inserted straight into the DB with a chosen status (library fixtures need completed/live/cancelled). */
async function insertLibraryLesson(teacherLabel: string, studentLabel: string, status: "scheduled" | "live" | "completed" | "cancelled"): Promise<string> {
  const slot = nextSlot(9);
  const [row] = await db
    .insert(lessons)
    .values({
      teacherId: uid(teacherLabel),
      studentId: uid(studentLabel),
      date: slot.date,
      time: slot.time,
      endTime: addMinutes(slot.time, LESSON_MINUTES),
      title: `Smoke library lesson ${runId}`,
      status,
      createdBy: adminId!,
    })
    .returning({ id: lessons.id });
  if (!row) throw new Error("could not insert a library lesson");
  return row.id;
}

async function setLessonStatus(lessonId: string, status: "completed" | "cancelled"): Promise<void> {
  await db.update(lessons).set({ status }).where(eq(lessons.id, lessonId));
}

async function bootstrapOf(label: string): Promise<Record<string, Record<string, Record<string, unknown>>>> {
  const res = await call(tok(label), "GET", "/school/bootstrap");
  expectStatus(res, 200, `bootstrap ${label}`);
  return obj(obj(res.body, "bootstrap").collections, "collections") as Record<string, Record<string, Record<string, unknown>>>;
}

async function libraryScenario(): Promise<void> {
  const bytesOf = (label: string) => new TextEncoder().encode(`smoke library ${label} ${runId}`);
  const pdf = async (label: string, name: string, bytes: Uint8Array) => {
    const res = await upload(tok(label), { name, type: "application/pdf", bytes });
    expectStatus(res, 201, `${label} uploads ${name}`);
    return str(res.body, "id");
  };
  const errorCode = (res: Res) => str(obj(res.body, "error").error, "code");
  const missing = "00000000-0000-4000-8000-000000000000";
  await createUser("managerC", "manager");

  // 1. Create ------------------------------------------------------------------------------
  const contentA = bytesOf("a");
  const fileA = await pdf("managerA", "lib-a.pdf", contentA);
  const created = await call(tok("managerA"), "POST", "/library", { attachmentId: fileA, title: "  Airport worksheet  ", category: "Worksheets", level: "B1", tags: ["travel", "travel", "speaking"] });
  expectStatus(created, 201, "manager creates a library item from own upload");
  const itemA = str(created.body, "id");
  check(str(created.body, "title") === "Airport worksheet", "library title is trimmed");
  check(str(created.body, "status") === "published", "new library item is published");
  check(str(created.body, "createdBy") === uid("managerA"), "createdBy is the actor");
  check(JSON.stringify(fieldArr(created.body, "tags")) === JSON.stringify(["travel", "speaking"]), "duplicate tags collapse");
  await expectOneActivity("libraryItem", itemA, "library.created");

  const fileB = await pdf("managerB", "lib-b.pdf", bytesOf("b"));
  expectStatus(await call(tok("managerA"), "POST", "/library", { attachmentId: fileB, title: "Not mine", category: "Worksheets" }), 403, "manager creates from another user's upload");
  const adminCreated = await call(tok("admin"), "POST", "/library", { attachmentId: fileB, title: "Team B slides", category: "Slides" });
  expectStatus(adminCreated, 201, "admin creates from another user's upload");
  const itemB = str(adminCreated.body, "id");
  check(str(adminCreated.body, "createdBy") === uid("admin"), "admin item createdBy is the admin");

  expectStatus(await call(tok("managerA"), "POST", "/library", { attachmentId: fileA, title: "Again", category: "Worksheets" }), 409, "second item on the same attachment");
  expectStatus(await call(tok("admin"), "POST", "/library", { attachmentId: missing, title: "Ghost", category: "Worksheets" }), 404, "unknown attachment");
  expectStatus(await call(tok("studentA"), "POST", "/library", { attachmentId: fileA, title: "Student", category: "Worksheets" }), 403, "student creates a library item");
  expectStatus(await call(tok("teacherA"), "POST", "/library", { attachmentId: fileA, title: "Teacher", category: "Worksheets" }), 403, "teacher creates a library item");
  // Client file metadata is never accepted: the strict body rejects it; metadata comes from the upload row.
  const fileMeta = await pdf("managerA", "lib-meta.pdf", bytesOf("meta"));
  expectStatus(await call(tok("managerA"), "POST", "/library", { attachmentId: fileMeta, title: "Meta", category: "Worksheets", name: "evil.exe", size: 1 }), 400, "client file metadata rejected");
  expectStatus(await call(tok("managerA"), "POST", "/library", { attachmentId: fileMeta, title: "Meta", category: "Worksheets", description: "x".repeat(2001) }), 400, "description over 2000 chars");
  expectStatus(await call(tok("managerA"), "POST", "/library", { attachmentId: fileMeta, title: "Meta", category: "Worksheets", level: "x".repeat(51) }), 400, "level over 50 chars");
  expectStatus(await call(tok("managerA"), "POST", "/library", { attachmentId: fileMeta, title: "Meta", category: "Worksheets", tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }), 400, "more than 20 tags");
  expectStatus(await call(tok("managerA"), "POST", "/library", { attachmentId: fileMeta, title: " ", category: "Worksheets" }), 400, "blank title");

  // Request evidence can never become a library item.
  const reqLesson = await insertLibraryLesson("teacherA", "studentA", "scheduled");
  const evidence = await pdf("teacherA", "lib-evidence.pdf", bytesOf("evidence"));
  const request = await call(tok("teacherA"), "POST", "/requests", { type: "lesson-cancellation", lessonId: reqLesson, reason: "Smoke library evidence", attachmentId: evidence });
  expectStatus(request, 201, "teacher files request evidence");
  const evidenceItem = await call(tok("admin"), "POST", "/library", { attachmentId: evidence, title: "Evidence", category: "Worksheets" });
  expectStatus(evidenceItem, 422, "request evidence into the library");
  check(errorCode(evidenceItem) === "ATTACHMENT_NOT_ELIGIBLE", `request evidence error code ${JSON.stringify(evidenceItem.body)}`);

  const createdC = await call(tok("managerC"), "POST", "/library", { attachmentId: await pdf("managerC", "lib-c.pdf", bytesOf("c")), title: "Manager C handout", category: "Handouts" });
  expectStatus(createdC, 201, "manager without a team creates an item");
  const itemC = str(createdC.body, "id");

  // 2. Patch -------------------------------------------------------------------------------
  expectStatus(await call(tok("managerA"), "PATCH", `/library/${itemA}`, { title: "Airport worksheet v2" }), 200, "creator edits");
  expectStatus(await call(tok("managerB"), "PATCH", `/library/${itemA}`, { title: "Hijack" }), 403, "other manager edits");
  expectStatus(await call(tok("teacherA"), "PATCH", `/library/${itemA}`, { title: "Hijack" }), 403, "teacher edits");
  expectStatus(await call(tok("admin"), "PATCH", `/library/${itemA}`, { category: "Worksheets A" }), 200, "admin edits");
  check((await activityCount("libraryItem", itemA, "library.updated")) === 2, "two edits log two library.updated rows");
  expectStatus(await call(tok("admin"), "PATCH", `/library/${itemA}`, { attachmentId: fileB }), 400, "PATCH cannot swap the file");
  expectStatus(await call(tok("admin"), "PATCH", `/library/${itemA}`, { createdBy: uid("managerB") }), 400, "PATCH cannot change the creator");
  expectStatus(await call(tok("admin"), "PATCH", `/library/${itemA}`, { owner: "x" }), 400, "PATCH rejects unknown keys");
  expectStatus(await call(tok("admin"), "PATCH", `/library/${itemA}`, {}), 400, "PATCH rejects an empty body");
  expectStatus(await call(tok("admin"), "PATCH", `/library/${missing}`, { title: "Ghost" }), 404, "PATCH unknown item");

  // 3. Attach ------------------------------------------------------------------------------
  const lessonA = await insertLibraryLesson("teacherA", "studentA", "scheduled");
  const lessonLive = await insertLibraryLesson("teacherA", "studentA", "live");
  const lessonDone = await insertLibraryLesson("teacherA", "studentA", "completed");
  const lessonGone = await insertLibraryLesson("teacherA", "studentA", "cancelled");
  const lessonB = await insertLibraryLesson("teacherB", "studentB", "scheduled");

  const attached = await call(tok("managerA"), "POST", `/lessons/${lessonA}/library-items`, { libraryItemId: itemA });
  expectStatus(attached, 200, "manager attaches to own-team lesson");
  check(str(attached.body, "id") === `${lessonA}:${itemA}`, "link id is lessonId:libraryItemId");
  expectStatus(await call(tok("managerA"), "POST", `/lessons/${lessonA}/library-items`, { libraryItemId: itemA }), 200, "repeat attach is idempotent");
  await expectOneActivity("lesson", lessonA, "lesson.libraryAttached");
  expectStatus(await call(tok("managerB"), "POST", `/lessons/${lessonA}/library-items`, { libraryItemId: itemB }), 403, "other-team manager attaches");
  expectStatus(await call(tok("teacherA"), "POST", `/lessons/${lessonA}/library-items`, { libraryItemId: itemB }), 403, "teacher attaches");
  expectStatus(await call(tok("studentA"), "POST", `/lessons/${lessonA}/library-items`, { libraryItemId: itemB }), 403, "student attaches");
  expectStatus(await call(tok("admin"), "POST", `/lessons/${lessonB}/library-items`, { libraryItemId: itemB }), 200, "admin attaches to any lesson");
  expectStatus(await call(tok("admin"), "POST", `/lessons/${lessonA}/library-items`, { libraryItemId: itemC }), 200, "admin attaches manager C's item");
  expectStatus(await call(tok("managerA"), "POST", `/lessons/${lessonLive}/library-items`, { libraryItemId: itemA }), 200, "attach to a live lesson");
  const doneAttach = await call(tok("managerA"), "POST", `/lessons/${lessonDone}/library-items`, { libraryItemId: itemA });
  expectStatus(doneAttach, 422, "attach to a completed lesson");
  check(errorCode(doneAttach) === "LESSON_NOT_ATTACHABLE", "completed lesson error code");
  expectStatus(await call(tok("managerA"), "POST", `/lessons/${lessonGone}/library-items`, { libraryItemId: itemA }), 422, "attach to a cancelled lesson");
  expectStatus(await call(tok("managerA"), "POST", `/lessons/${missing}/library-items`, { libraryItemId: itemA }), 404, "attach to an unknown lesson");
  expectStatus(await call(tok("managerA"), "POST", `/lessons/${lessonA}/library-items`, { libraryItemId: missing }), 404, "attach an unknown item");

  // 4. Download ----------------------------------------------------------------------------
  const studentBytes = await download(tok("studentA"), fileA);
  check(studentBytes.status === 200 && Buffer.compare(Buffer.from(studentBytes.bytes), Buffer.from(contentA)) === 0, `linked student downloads identical bytes (got ${studentBytes.status})`);
  check((await download(tok("studentB"), fileA)).status === 403, "unrelated student download blocked");
  check((await download(tok("teacherA"), fileA)).status === 200, "teacher of the linked lesson downloads");
  check((await download(tok("teacherB"), fileA)).status === 403, "unrelated teacher download blocked");
  check((await download(tok("managerB"), fileA)).status === 200, "other manager downloads a published item");

  // A student whose only linked lesson is cancelled loses access.
  const fileZ = await pdf("managerA", "lib-z.pdf", bytesOf("z"));
  const createdZ = await call(tok("managerA"), "POST", "/library", { attachmentId: fileZ, title: "Zero handout", category: "Handouts" });
  expectStatus(createdZ, 201, "create item for the cancel check");
  const itemZ = str(createdZ.body, "id");
  const lessonZero = await insertLibraryLesson("teacherA", "studentZero", "scheduled");
  expectStatus(await call(tok("managerA"), "POST", `/lessons/${lessonZero}/library-items`, { libraryItemId: itemZ }), 200, "attach item for studentZero");
  check((await download(tok("studentZero"), fileZ)).status === 200, "student downloads before the lesson is cancelled");
  await setLessonStatus(lessonZero, "cancelled");
  check((await download(tok("studentZero"), fileZ)).status === 403, "student of a cancelled linked lesson is blocked");

  // Archive: no new browse, existing links keep access.
  expectStatus(await call(tok("managerA"), "PATCH", `/library/${itemA}`, { status: "archived" }), 200, "creator archives");
  await expectOneActivity("libraryItem", itemA, "library.archived");
  check((await download(tok("studentA"), fileA)).status === 200, "linked student keeps access to an archived item");
  check((await download(tok("managerB"), fileA)).status === 403, "other manager loses an archived item not linked to their team");
  check((await download(tok("managerA"), fileA)).status === 200, "creator keeps access to an archived item");
  expectStatus(await call(tok("managerA"), "POST", `/lessons/${lessonLive}/library-items`, { libraryItemId: itemA }), 422, "archived item cannot be attached again");
  const fileU = await pdf("managerA", "lib-u.pdf", bytesOf("u"));
  const createdU = await call(tok("managerA"), "POST", "/library", { attachmentId: fileU, title: "Unused", category: "Handouts" });
  expectStatus(createdU, 201, "create an unlinked item");
  const itemU = str(createdU.body, "id");
  expectStatus(await call(tok("managerA"), "PATCH", `/library/${itemU}`, { status: "archived" }), 200, "archive the unlinked item");
  check((await download(tok("managerB"), fileU)).status === 403, "other manager blocked from an archived unlinked item");
  const blocked = await call(tok("managerA"), "POST", `/lessons/${lessonA}/library-items`, { libraryItemId: itemU });
  expectStatus(blocked, 422, "attach an archived item");
  check(errorCode(blocked) === "ITEM_ARCHIVED", "archived item error code");
  expectStatus(await call(tok("managerA"), "PATCH", `/library/${itemU}`, { status: "published" }), 200, "unarchive");
  check((await activityCount("libraryItem", itemU, "library.archived")) === 1, "unarchive logs no second library.archived row");
  await expectOneActivity("libraryItem", itemU, "library.updated");

  // Phase 02 regression with library items present.
  check((await download(tok("studentA"), evidence)).status === 403, "request evidence stays student-invisible");
  const stray = await pdf("managerB", "lib-stray.pdf", bytesOf("stray"));
  check((await download(tok("studentA"), stray)).status === 403, "unreferenced upload stays blocked for a student");
  check((await download(tok("managerA"), stray)).status === 403, "unreferenced upload stays blocked for another manager");

  // 5. Bootstrap per role --------------------------------------------------------------------
  const studentBoot = await bootstrapOf("studentA");
  const studentLessonIds = new Set(Object.keys(studentBoot.lessons ?? {}));
  const studentLinks = Object.values(studentBoot.lessonLibraryItems ?? {});
  check(studentLinks.every((link) => studentLessonIds.has(String(link.lessonId))), "student sees only links on own lessons");
  check(Boolean(studentBoot.lessonLibraryItems?.[`${lessonA}:${itemA}`]), "student sees the link on their lesson");
  check(Boolean(studentBoot.libraryItems?.[itemA]) && Boolean(studentBoot.libraryItems?.[itemC]), "student sees items linked to their lessons");
  check(!studentBoot.libraryItems?.[itemB] && !studentBoot.libraryItems?.[itemU], "student does not browse other items");
  check(Boolean(studentBoot.attachments?.[fileA]) && studentBoot.attachments?.[fileA]?.name === "lib-a.pdf" && studentBoot.attachments?.[fileA]?.size === contentA.length, "attachment metadata comes from the upload row");
  check(!studentBoot.users?.[uid("managerC")], "student bootstrap pulls no library creator rows");
  check(Object.values(studentBoot.libraryItems ?? {}).every((item) => item.createdByName === undefined), "student library items carry no creator name");

  const zeroBoot = await bootstrapOf("studentZero");
  check(Object.keys(zeroBoot.libraryItems ?? {}).length === 0 && Object.keys(zeroBoot.lessonLibraryItems ?? {}).length === 0, "student with only a cancelled linked lesson sees no library data");

  const teacherBoot = await bootstrapOf("teacherA");
  const teacherLessons = teacherBoot.lessons ?? {};
  check(Object.values(teacherBoot.lessonLibraryItems ?? {}).every((link) => teacherLessons[String(link.lessonId)] && teacherLessons[String(link.lessonId)]?.status !== "cancelled"), "teacher sees only links on own non-cancelled lessons");
  check(Boolean(teacherBoot.libraryItems?.[itemA]) && !teacherBoot.libraryItems?.[itemZ] && !teacherBoot.libraryItems?.[itemB], "teacher item visibility");
  check(!teacherBoot.users?.[uid("managerC")], "teacher bootstrap pulls no library creator rows");
  check(Object.values(teacherBoot.libraryItems ?? {}).every((item) => item.createdByName === undefined), "teacher library items carry no creator name");

  const managerBoot = await bootstrapOf("managerA");
  check(Boolean(managerBoot.libraryItems?.[itemB]) && Boolean(managerBoot.libraryItems?.[itemC]), "manager browses published items");
  check(Boolean(managerBoot.libraryItems?.[itemA]), "manager sees own archived item");
  check(Boolean(managerBoot.lessonLibraryItems?.[`${lessonA}:${itemA}`]) && !managerBoot.lessonLibraryItems?.[`${lessonB}:${itemB}`], "manager sees team links only");
  const creatorBoot = await bootstrapOf("admin");
  const managerCName = creatorBoot.users?.[uid("managerC")]?.name;
  check(typeof managerCName === "string" && managerCName.length > 0, "admin bootstrap has managerC's name");
  check(!managerBoot.users?.[uid("managerC")], "manager bootstrap pulls no other-manager user row because of the library");
  check(managerBoot.libraryItems?.[itemC]?.createdByName === managerCName, "manager bootstrap carries the library creator's display name");
  check(creatorBoot.libraryItems?.[itemC]?.createdByName === managerCName, "admin bootstrap carries the library creator's display name");
  const managerBBoot = await bootstrapOf("managerB");
  check(!managerBBoot.libraryItems?.[itemA], "other manager does not see an archived item unrelated to their team");
  check(!managerBBoot.lessonLibraryItems?.[`${lessonA}:${itemA}`], "other manager sees no links on another team's lessons");
  for (const label of ["studentA", "studentB", "teacherA", "managerB"]) {
    const boot = label === "studentA" ? studentBoot : label === "teacherA" ? teacherBoot : label === "managerB" ? managerBBoot : await bootstrapOf(label);
    const lessonIds = new Set(Object.keys(boot.lessons ?? {}));
    check(Object.values(boot.lessonLibraryItems ?? {}).every((link) => lessonIds.has(String(link.lessonId))), `${label} gets no link rows for lessons outside their view`);
  }
  const adminBoot = await bootstrapOf("admin");
  check(Boolean(adminBoot.lessonLibraryItems?.[`${lessonB}:${itemB}`]) && Boolean(adminBoot.libraryItems?.[itemU]), "admin sees every item and link");

  // 6. Detach --------------------------------------------------------------------------------
  expectStatus(await call(tok("teacherA"), "DELETE", `/lessons/${lessonLive}/library-items/${itemA}`), 403, "teacher detaches");
  expectStatus(await call(tok("studentA"), "DELETE", `/lessons/${lessonLive}/library-items/${itemA}`), 403, "student detaches");
  expectStatus(await call(tok("managerB"), "DELETE", `/lessons/${lessonLive}/library-items/${itemA}`), 403, "other-team manager detaches");
  expectStatus(await call(tok("managerA"), "DELETE", `/lessons/${missing}/library-items/${itemA}`), 404, "detach on an unknown lesson");
  expectStatus(await call(tok("managerA"), "DELETE", `/lessons/${lessonA}/library-items/${missing}`), 404, "detach an unknown item");
  expectStatus(await call(tok("managerA"), "DELETE", `/lessons/${lessonA}/library-items/${itemA}`), 204, "manager detaches");
  expectStatus(await call(tok("managerA"), "DELETE", `/lessons/${lessonA}/library-items/${itemA}`), 204, "repeat detach is idempotent");
  await expectOneActivity("lesson", lessonA, "lesson.libraryDetached");
  await setLessonStatus(lessonLive, "completed");
  expectStatus(await call(tok("managerA"), "DELETE", `/lessons/${lessonLive}/library-items/${itemA}`), 204, "detach on a completed lesson");
  await expectOneActivity("lesson", lessonLive, "lesson.libraryDetached");
  check((await download(tok("studentA"), fileA)).status === 403, "student loses access once the item is detached everywhere");

  expectStatus(await call(null, "POST", "/library", { attachmentId: fileA, title: "x", category: "y" }), 401, "anonymous create");
  check(str(createdC.body, "createdByName") === managerCName, "create response carries the creator name");

  await libraryStepFChecks(pdf, bytesOf);
}

/** Step F library checks: plan/library overlap, concurrency, and the status CHECK (F5 i-iii, v). */
async function libraryStepFChecks(
  pdf: (label: string, name: string, bytes: Uint8Array) => Promise<string>,
  bytesOf: (label: string) => Uint8Array,
): Promise<void> {
  // (i) A file that is both a published-course plan attachment and a library item keeps plan access.
  const both = await pdf("managerA", "lib-both.pdf", bytesOf("both"));
  expectStatus(await call(tok("managerA"), "POST", `/courses/${courseId}/units/${unitId}/plans/${firstPlanId}/attachments`, { attachmentId: both }), 200, "attach the overlap file to a plan");
  const bothItem = await call(tok("managerA"), "POST", "/library", { attachmentId: both, title: "Overlap", category: "Handouts" });
  expectStatus(bothItem, 201, "overlap file becomes a library item");
  const bothItemId = str(bothItem.body, "id");
  const bothLesson = await insertLibraryLesson("teacherA", "studentA", "scheduled");
  expectStatus(await call(tok("managerA"), "POST", `/lessons/${bothLesson}/library-items`, { libraryItemId: bothItemId }), 200, "link the overlap item to a lesson");
  check((await download(tok("studentA"), both)).status === 200, "enrolled student downloads the overlap file");
  check((await download(tok("teacherA"), both)).status === 200, "enrolled teacher downloads the overlap file");
  check((await download(tok("studentB"), both)).status === 403, "unrelated student blocked from the overlap file");
  expectStatus(await call(tok("managerA"), "PATCH", `/library/${bothItemId}`, { status: "archived" }), 200, "archive the overlap item");
  expectStatus(await call(tok("managerA"), "DELETE", `/lessons/${bothLesson}/library-items/${bothItemId}`), 204, "detach the overlap item");
  check((await download(tok("studentA"), both)).status === 200, "plan access survives archive and detach of the library link");
  check((await download(tok("studentB"), both)).status === 403, "unrelated student still blocked after detach");

  // (ii) Two parallel creates on one upload: exactly one 201 and one 409, never 500.
  const raceFile = await pdf("managerA", "lib-race.pdf", bytesOf("race"));
  const creates = await Promise.all([0, 1].map((n) => call(tok("managerA"), "POST", "/library", { attachmentId: raceFile, title: `Race ${n}`, category: "Handouts" })));
  const createStatuses = creates.map((res) => res.status).sort((a, b) => a - b);
  check(JSON.stringify(createStatuses) === JSON.stringify([201, 409]), `parallel creates give [201, 409], got ${JSON.stringify(createStatuses)}`);
  const raceItem = creates.find((res) => res.status === 201);
  if (!raceItem) throw new Error("no parallel create succeeded");
  const raceItemId = str(raceItem.body, "id");

  // (iii) Two parallel attaches: both 200, exactly one activity row.
  const raceLesson = await insertLibraryLesson("teacherA", "studentA", "scheduled");
  const linkPath = `/lessons/${raceLesson}/library-items`;
  const attaches = await Promise.all([0, 1].map(() => call(tok("managerA"), "POST", linkPath, { libraryItemId: raceItemId })));
  check(attaches.every((res) => res.status === 200), `parallel attaches both 200, got ${JSON.stringify(attaches.map((res) => res.status))}`);
  await expectOneActivity("lesson", raceLesson, "lesson.libraryAttached");

  // Attach racing detach: never 500; attach in {200, 409}, detach in {200, 204}.
  for (let round = 0; round < 5; round += 1) {
    const [attachRes, detachRes] = await Promise.all([
      call(tok("managerA"), "POST", linkPath, { libraryItemId: raceItemId }),
      call(tok("managerA"), "DELETE", `${linkPath}/${raceItemId}`),
    ]);
    check(attachRes.status === 200 || attachRes.status === 409, `attach vs detach round ${round}: attach got ${attachRes.status}`);
    check(detachRes.status === 200 || detachRes.status === 204, `attach vs detach round ${round}: detach got ${detachRes.status}`);
  }
  const settle = await call(tok("managerA"), "POST", linkPath, { libraryItemId: raceItemId });
  expectStatus(settle, 200, "attach after the race settles");
  const links = Object.values((await bootstrapOf("admin")).lessonLibraryItems ?? {}).filter((link) => link.lessonId === raceLesson && link.libraryItemId === raceItemId);
  check(links.length === 1, `end state holds exactly one link, got ${links.length}`);

  // (v) The DB CHECK rejects an invalid status (23514); no row is left behind.
  const bogusFile = await pdf("admin", "lib-bogus.pdf", bytesOf("bogus"));
  let code: unknown;
  try {
    await db.insert(libraryItems).values({ title: "Bogus", category: "Handouts", attachmentId: bogusFile, createdBy: adminId!, status: "bogus" });
  } catch (error) {
    const err = error as { code?: unknown; cause?: { code?: unknown } };
    code = err.code ?? err.cause?.code;
  }
  check(code === "23514", `invalid status insert fails with a check violation (got ${String(code)})`);
  const leftover = await db.select({ id: libraryItems.id }).from(libraryItems).where(eq(libraryItems.attachmentId, bogusFile));
  check(leftover.length === 0, "the rejected insert left no library row");
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
  await scenario("refunds", refundEvidenceScenario);
  await scenario("homework", homeworkScenario);
  await scenario("quality", qualityScenario);
  await scenario("profile", profileScenario);
  await scenario("uploads", uploadsScenario);
  await scenario("notifications", notificationsScenario);
  await scenario("library", libraryScenario);
  await scenario("auth", authScenario);

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
