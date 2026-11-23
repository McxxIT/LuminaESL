import { expect, test } from "@playwright/test";
import {
  apiCall,
  apiGet,
  apiLogin,
  apiPost,
  bootstrap,
  creditBalance,
  openSlot,
  setCreditBalance,
  slotsFor,
  type ApiLesson,
  type Bootstrap,
} from "../support/api";
import { isoDaysFromNow } from "../support/flows";
import { ensurePreconditions } from "../support/preconditions";

/**
 * Active-slot collisions: `lessons_active_teacher_date_time_uidx` is the
 * concurrency authority, so every writer (admin create, student booking,
 * reschedule, reactivation) must answer with one deterministic 409 and leave
 * lesson, slot, debit, and activity state untouched.
 *
 * Every test uses its own far-future date and cleans up in `finally`, so repeat
 * runs on the same day start from a free key. Cancelled rows stay behind as
 * history and are allowed to share the key.
 */

const CONFLICT_MESSAGE =
  "That teacher already has an active lesson at this date and time";

type ErrorBody = { error?: { code?: string; message?: string } };

/**
 * Active lessons only. Cancelled/completed rows are allowed to share the key as
 * history, so counting every row would fail on the second run.
 */
function activeLessonsAt(
  school: Bootstrap,
  match: { teacherId: string; date: string; time: string },
): ApiLesson[] {
  return Object.values(school.collections.lessons).filter(
    (lesson) =>
      lesson.teacherId === match.teacherId &&
      lesson.date === match.date &&
      lesson.time === match.time &&
      (lesson.status === "scheduled" || lesson.status === "live"),
  );
}

/** Cancelling through PATCH frees the key without touching the ledger. */
async function cancelLesson(token: string, id: string): Promise<void> {
  await apiCall(`/lessons/${id}`, {
    method: "PATCH",
    token,
    body: { status: "cancelled" },
  });
}

async function closeSlot(token: string, id: string | undefined): Promise<void> {
  if (!id) return;
  await apiCall(`/bookings/slots/${id}`, { method: "DELETE", token });
}

test.describe("API mode booking collision", () => {
  test.beforeAll(async () => {
    await ensurePreconditions();
  });

  test("a second booking at an occupied teacher slot returns 409 and changes nothing", async () => {
    const { adminToken, teacher, student } = await ensurePreconditions();
    const studentToken = await apiLogin("student@lumina.school");
    const date = isoDaysFromNow(40);
    const time = "09:00";
    const startingBalance = await creditBalance(adminToken, student.id);
    await setCreditBalance(adminToken, student.id, Math.max(startingBalance, 5));

    const created: string[] = [];
    let slotId: string | undefined;

    try {
      const firstSlot = await openSlot(adminToken, {
        teacherId: teacher.id,
        date,
        time,
      });
      slotId = firstSlot.id;

      const booked = await apiCall<ApiLesson>("/bookings", {
        method: "POST",
        token: studentToken,
        body: { slotId: firstSlot.id },
      });
      expect(booked.status, JSON.stringify(booked.body)).toBe(201);
      created.push(booked.body.id);

      const balanceAfterBooking = await creditBalance(adminToken, student.id);

      // Booking consumed the slot; reopening it must not grant the same key twice.
      const reopened = await openSlot(adminToken, {
        teacherId: teacher.id,
        date,
        time,
      });
      slotId = reopened.id;

      const collision = await apiCall<ErrorBody>("/bookings", {
        method: "POST",
        token: studentToken,
        body: { slotId: reopened.id },
      });
      expect(collision.status).toBe(409);
      expect(collision.body.error?.code).toBe("CONFLICT");
      expect(collision.body.error?.message).toBe(CONFLICT_MESSAGE);

      // No debit, no second lesson, and the slot was not consumed by the loser.
      expect(await creditBalance(adminToken, student.id)).toBe(balanceAfterBooking);
      const school = await bootstrap(adminToken);
      expect(activeLessonsAt(school, { teacherId: teacher.id, date, time })).toHaveLength(1);
      const stillOpen = await slotsFor(adminToken, {
        teacherId: teacher.id,
        from: date,
        to: date,
      });
      expect(stillOpen.some((slot) => slot.id === reopened.id)).toBe(true);
    } finally {
      for (const id of created) await cancelLesson(adminToken, id);
      await closeSlot(adminToken, slotId);
      await setCreditBalance(adminToken, student.id, startingBalance);
    }
  });

  test("rescheduling onto an occupied slot returns 409 and leaves the lesson in place", async () => {
    const { adminToken, teacher, student } = await ensurePreconditions();
    const date = isoDaysFromNow(47);
    const startingBalance = await creditBalance(adminToken, student.id);
    await setCreditBalance(adminToken, student.id, Math.max(startingBalance, 5));

    const created: string[] = [];

    try {
      const anchor = await apiPost<ApiLesson>("/lessons", adminToken, {
        teacherId: teacher.id,
        studentId: student.id,
        date,
        time: "09:00",
        title: "Collision reschedule anchor",
      });
      created.push(anchor.id);

      const mover = await apiPost<ApiLesson>("/lessons", adminToken, {
        teacherId: teacher.id,
        studentId: student.id,
        date,
        time: "10:00",
        title: "Collision reschedule mover",
      });
      created.push(mover.id);

      const collision = await apiCall<ErrorBody>(`/lessons/${mover.id}`, {
        method: "PATCH",
        token: adminToken,
        body: { date, time: "09:00" },
      });
      expect(collision.status).toBe(409);
      expect(collision.body.error?.code).toBe("CONFLICT");
      expect(collision.body.error?.message).toBe(CONFLICT_MESSAGE);

      const unchanged = await apiGet<ApiLesson>(`/lessons/${mover.id}`, adminToken);
      expect(unchanged.time).toBe("10:00");
      expect(unchanged.date).toBe(date);
      expect(unchanged.status).toBe("scheduled");
    } finally {
      for (const id of created) await cancelLesson(adminToken, id);
      await setCreditBalance(adminToken, student.id, startingBalance);
    }
  });

  test("reactivating a cancelled lesson into an occupied slot returns 409", async () => {
    const { adminToken, teacher, student } = await ensurePreconditions();
    const date = isoDaysFromNow(54);
    const startingBalance = await creditBalance(adminToken, student.id);
    await setCreditBalance(adminToken, student.id, Math.max(startingBalance, 5));

    const created: string[] = [];

    try {
      const anchor = await apiPost<ApiLesson>("/lessons", adminToken, {
        teacherId: teacher.id,
        studentId: student.id,
        date,
        time: "09:00",
        title: "Collision status anchor",
      });
      created.push(anchor.id);

      const dormant = await apiPost<ApiLesson>("/lessons", adminToken, {
        teacherId: teacher.id,
        studentId: student.id,
        date,
        time: "11:00",
        title: "Collision status dormant",
      });
      created.push(dormant.id);

      const cancelled = await apiCall<ApiLesson>(`/lessons/${dormant.id}`, {
        method: "PATCH",
        token: adminToken,
        body: { status: "cancelled" },
      });
      expect(cancelled.status).toBe(200);

      // Cancelled history may share the key, but coming back to `scheduled` may not.
      const collision = await apiCall<ErrorBody>(`/lessons/${dormant.id}`, {
        method: "PATCH",
        token: adminToken,
        body: { date, time: "09:00", status: "scheduled" },
      });
      expect(collision.status).toBe(409);
      expect(collision.body.error?.code).toBe("CONFLICT");

      const unchanged = await apiGet<ApiLesson>(`/lessons/${dormant.id}`, adminToken);
      expect(unchanged.status).toBe("cancelled");
      expect(unchanged.time).toBe("11:00");
    } finally {
      for (const id of created) await cancelLesson(adminToken, id);
      await setCreditBalance(adminToken, student.id, startingBalance);
    }
  });

  test("concurrent creates at one key yield one winner and one conflict", async () => {
    const { adminToken, teacher, student } = await ensurePreconditions();
    const date = isoDaysFromNow(61);
    const time = "09:00";
    const startingBalance = await creditBalance(adminToken, student.id);
    await setCreditBalance(adminToken, student.id, Math.max(startingBalance, 5));

    const created: string[] = [];

    try {
      const payload = {
        teacherId: teacher.id,
        studentId: student.id,
        date,
        time,
        title: "Collision race",
      };
      const [left, right] = await Promise.all([
        apiCall<ApiLesson | ErrorBody>("/lessons", { method: "POST", token: adminToken, body: payload }),
        apiCall<ApiLesson | ErrorBody>("/lessons", { method: "POST", token: adminToken, body: payload }),
      ]);

      expect([left.status, right.status].sort((a, b) => a - b)).toEqual([201, 409]);
      const loser = left.status === 409 ? left : right;
      expect((loser.body as ErrorBody).error?.code).toBe("CONFLICT");

      const winner = left.status === 201 ? left : right;
      created.push((winner.body as ApiLesson).id);

      const school = await bootstrap(adminToken);
      expect(activeLessonsAt(school, { teacherId: teacher.id, date, time })).toHaveLength(1);
    } finally {
      for (const id of created) await cancelLesson(adminToken, id);
      await setCreditBalance(adminToken, student.id, startingBalance);
    }
  });

  test("collision stays distinct from validation and insufficient credit", async () => {
    const { adminToken, teacher, student } = await ensurePreconditions();

    const invalid = await apiCall<ErrorBody>("/lessons", {
      method: "POST",
      token: adminToken,
      body: {
        teacherId: teacher.id,
        studentId: student.id,
        date: "not-a-date",
        time: "09:00",
        title: "Collision validation probe",
      },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error?.code).toBe("VALIDATION_ERROR");

    const date = isoDaysFromNow(68);
    const startingBalance = await creditBalance(adminToken, student.id);
    await setCreditBalance(adminToken, student.id, 0);

    try {
      const broke = await apiCall<ErrorBody>("/lessons", {
        method: "POST",
        token: adminToken,
        body: {
          teacherId: teacher.id,
          studentId: student.id,
          date,
          time: "09:00",
          title: "Collision credit probe",
        },
      });
      expect(broke.status).toBe(400);
      expect(broke.body.error?.code).toBe("BAD_REQUEST");
      expect(broke.body.error?.message).toMatch(/enough credits/i);
      // A balance rejection is not a collision and must not leave a lesson behind.
      expect(await creditBalance(adminToken, student.id)).toBe(0);
      const school = await bootstrap(adminToken);
      expect(activeLessonsAt(school, { teacherId: teacher.id, date, time: "09:00" })).toHaveLength(0);
    } finally {
      await setCreditBalance(adminToken, student.id, startingBalance);
    }
  });
});
