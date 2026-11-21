import { expect, test } from "@playwright/test";
import {
  API_BASE,
  apiGet,
  apiLogin,
  bootstrap,
  creditBalance,
  setCreditBalance,
} from "../support/api";
import { isoDaysFromNow } from "../support/flows";
import { ensurePreconditions } from "../support/preconditions";

/**
 * Credit ledger serialization.
 *
 * Every one of these races needs two requests in flight at the same time, so
 * this spec talks to the API directly instead of driving the UI. Each test
 * asserts on the ledger (balance + row counts), never on timing, and restores
 * the balance and any leftover slot it created.
 */

type ApiResult<T = unknown> = { status: number; body: T };

async function call<T = unknown>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  token: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function post<T = unknown>(
  path: string,
  token: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  return call<T>("POST", path, token, body);
}

const CANDIDATE_TIMES = [
  "06:00",
  "06:30",
  "07:00",
  "07:30",
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
  "20:30",
  "21:00",
];

/** First candidate time with no open slot yet for this teacher on this date. */
async function freeTime(
  token: string,
  teacherId: string,
  date: string,
): Promise<string> {
  const open = await apiGet<Array<{ date: string; time: string }>>(
    `/bookings/slots?teacherId=${teacherId}&from=${date}&to=${date}`,
    token,
  );
  const taken = new Set(open.map((slot) => slot.time));
  const time = CANDIDATE_TIMES.find((candidate) => !taken.has(candidate));
  if (!time) throw new Error(`No free slot time left on ${date}`);
  return time;
}

async function openSlot(
  token: string,
  teacherId: string,
  date: string,
  time: string,
): Promise<{ id: string; date: string; time: string }> {
  const result = await post<{ id: string; date: string; time: string }>(
    "/bookings/slots",
    token,
    { teacherId, date, time },
  );
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body;
}

async function closeSlots(
  token: string,
  teacherId: string,
  ids: string[],
  from: string,
  to: string,
): Promise<void> {
  const open = await apiGet<Array<{ id: string }>>(
    `/bookings/slots?teacherId=${teacherId}&from=${from}&to=${to}`,
    token,
  );
  for (const slot of open) {
    if (ids.includes(slot.id)) await call("DELETE", `/bookings/slots/${slot.id}`, token);
  }
}

test.describe("API mode credit ledger serialization", () => {
  test.beforeAll(async () => {
    await ensurePreconditions();
  });

  test("two concurrent bookings cannot overdraw one credit", async () => {
    const { adminToken, student, teacher } = await ensurePreconditions();
    const dateA = isoDaysFromNow(9);
    const dateB = isoDaysFromNow(10);
    const timeA = await freeTime(adminToken, teacher.id, dateA);
    const timeB = await freeTime(adminToken, teacher.id, dateB);
    const slotA = await openSlot(adminToken, teacher.id, dateA, timeA);
    const slotB = await openSlot(adminToken, teacher.id, dateB, timeB);
    const studentToken = await apiLogin("student@lumina.school");
    const original = await setCreditBalance(adminToken, student.id, 1);
    const slotIds = [slotA.id, slotB.id];
    // Diff lesson ids: earlier runs of this spec (and its negative probe) leave
    // probe lessons behind, so counting lessons on the date is not stable.
    const before = await bootstrap(adminToken);
    const knownLessonIds = new Set(Object.keys(before.collections.lessons));

    try {
      const [first, second] = await Promise.all([
        post("/bookings", studentToken, { slotId: slotA.id }),
        post("/bookings", studentToken, { slotId: slotB.id }),
      ]);

      const statuses = [first.status, second.status].sort((a, b) => a - b);
      expect(
        statuses,
        `one booking must win and the other must be refused: ${JSON.stringify([first.body, second.body])}`,
      ).toEqual([201, 422]);
      expect(await creditBalance(adminToken, student.id)).toBeCloseTo(0, 5);

      const after = await bootstrap(adminToken);
      const created = Object.values(after.collections.lessons).filter(
        (lesson) => !knownLessonIds.has(lesson.id),
      );
      expect(created, "exactly one lesson for one credit").toHaveLength(1);
      expect(created[0].studentId).toBe(student.id);
    } finally {
      await setCreditBalance(adminToken, student.id, original);
      await closeSlots(adminToken, teacher.id, slotIds, dateA, dateB);
    }
  });

  test("two concurrent student cancellations refund exactly one credit", async () => {
    const { adminToken, student, teacher } = await ensurePreconditions();
    const date = isoDaysFromNow(12);
    const time = await freeTime(adminToken, teacher.id, date);
    const original = await setCreditBalance(adminToken, student.id, 1);
    const studentToken = await apiLogin("student@lumina.school");

    const created = await post<{ id: string }>("/lessons", adminToken, {
      teacherId: teacher.id,
      studentId: student.id,
      date,
      time,
      title: `Race cancellation ${date} ${time}`,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    try {
      const [first, second] = await Promise.all([
        post<{ refunded: boolean }>(`/lessons/${created.body.id}/cancel`, studentToken, {}),
        post<{ refunded: boolean }>(`/lessons/${created.body.id}/cancel`, studentToken, {}),
      ]);

      const statuses = [first.status, second.status].sort((a, b) => a - b);
      expect(
        statuses,
        `one cancel must win and the other must conflict: ${JSON.stringify([first.body, second.body])}`,
      ).toEqual([200, 409]);
      const winner = first.status === 200 ? first.body : second.body;
      expect(winner.refunded, "the winning cancel refunds").toBe(true);
      expect(await creditBalance(adminToken, student.id)).toBeCloseTo(1, 5);
    } finally {
      await setCreditBalance(adminToken, student.id, original);
    }
  });

  test("two concurrent absences record one absence and one refund", async () => {
    const { adminToken, student, teacher } = await ensurePreconditions();
    const date = isoDaysFromNow(-1);
    const time = await freeTime(adminToken, teacher.id, date);
    const original = await setCreditBalance(adminToken, student.id, 1);

    const created = await post<{ id: string }>("/lessons", adminToken, {
      teacherId: teacher.id,
      studentId: student.id,
      date,
      time,
      title: `Race absence ${date} ${time}`,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const body = { note: "Connectivity failed before the lesson started." };

    try {
      const [first, second] = await Promise.all([
        post(`/lessons/${created.body.id}/absence`, adminToken, body),
        post(`/lessons/${created.body.id}/absence`, adminToken, body),
      ]);

      const statuses = [first.status, second.status].sort((a, b) => a - b);
      expect(
        statuses,
        `one absence must win and the other must conflict: ${JSON.stringify([first.body, second.body])}`,
      ).toEqual([201, 409]);
      expect(await creditBalance(adminToken, student.id)).toBeCloseTo(1, 5);
    } finally {
      await setCreditBalance(adminToken, student.id, original);
    }
  });
});
