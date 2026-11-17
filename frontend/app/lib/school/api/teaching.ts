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
