import { request } from "../../api/client";
import { refreshSchoolAfterCommand } from "./school";

async function command<T>(path: string, method: "POST", body: unknown): Promise<T> {
  const value = await request<T>(path, { method, body });
  await refreshSchoolAfterCommand();
  return value;
}

export const reviewRequest = (id: string, status: "approved" | "rejected", reviewNote: string) =>
  command(`/requests/${encodeURIComponent(id)}/review`, "POST", { status, reviewNote });
export const recordAbsence = (lessonId: string, note: string) =>
  command(`/lessons/${encodeURIComponent(lessonId)}/absence`, "POST", { note });
