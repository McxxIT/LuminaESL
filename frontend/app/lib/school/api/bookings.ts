import { request } from "../../api/client";
import { refreshSchoolAfterCommand } from "./school";
import { getSchoolSnapshot } from "../store";

async function command<T>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const value = await request<T>(path, { method, ...(body === undefined ? {} : { body }) });
  await refreshSchoolAfterCommand();
  return value;
}

export function slotIdFor(teacherId: string, date: string, time: string): string | undefined {
  return Object.values(getSchoolSnapshot().collections.slotOpenings)
    .find((slot) => slot.teacherId === teacherId && slot.date === date && slot.time === time)?.id;
}

export const openSlot = (teacherId: string, date: string, time: string) =>
  command(`/bookings/slots`, "POST", { teacherId, date, time });
export const closeSlot = (slotId: string) => command(`/bookings/slots/${encodeURIComponent(slotId)}`, "DELETE");
export const bookSlot = (slotId: string, studentId?: string) =>
  command(`/bookings`, "POST", { slotId, ...(studentId ? { studentId } : {}) });
export const createLesson = (input: Record<string, unknown>) => command("/lessons", "POST", input);
export const updateLesson = (lessonId: string, input: Record<string, unknown>) =>
  command(`/lessons/${encodeURIComponent(lessonId)}`, "PATCH", input);
export const rebookLesson = (lessonId: string, date: string, time: string) =>
  command(`/lessons/${encodeURIComponent(lessonId)}/rebook`, "POST", { date, time });
export const cancelLesson = (lessonId: string, reason: string) =>
  command(`/lessons/${encodeURIComponent(lessonId)}/cancel`, "POST", { reason });
