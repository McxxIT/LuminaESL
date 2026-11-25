import { request } from "../../api/client";
import { refreshSchoolAfterCommand } from "./school";

async function command<T>(path: string, method: "POST" | "DELETE", body?: unknown): Promise<T> {
  const value = await request<T>(path, { method, ...(body === undefined ? {} : { body }) });
  await refreshSchoolAfterCommand();
  return value;
}

export const createRequest = (input: Record<string, unknown>) => command("/requests", "POST", input);
export const deleteRequest = (path: string) => command(path, "DELETE");
export const completeLesson = (lessonId: string, input: Record<string, unknown>) =>
  command(`/lessons/${encodeURIComponent(lessonId)}/complete`, "POST", input);
export const withdrawRequest = (requestId: string) =>
  command(`/requests/${encodeURIComponent(requestId)}/withdraw`, "POST", {});
export const rateLesson = (lessonId: string, input: { score: number; comment?: string; from: "student" | "parent" }) =>
  command(`/lessons/${encodeURIComponent(lessonId)}/ratings`, "POST", input);

/** Uploads a data-URL file to `/uploads` and returns the stored attachment id. */
export async function uploadDataUrlAttachment(file: { name: string; type: string; dataUrl: string }): Promise<string> {
  const blob = await (await fetch(file.dataUrl)).blob();
  const form = new FormData();
  form.append("file", new Blob([blob], { type: file.type || blob.type }), file.name);
  const attachment = await request<{ id: string }>("/uploads", { method: "POST", body: form });
  return attachment.id;
}
