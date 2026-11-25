import { request } from "../../api/client";
import { refreshSchoolAfterCommand } from "./school";

async function command<T>(path: string, body: unknown): Promise<T> {
  const value = await request<T>(path, { method: "POST", body });
  await refreshSchoolAfterCommand();
  return value;
}

export const assignHomework = (input: Record<string, unknown>) => command("/assignments", input);
export const submitHomework = (id: string, response: string) =>
  command(`/assignments/${encodeURIComponent(id)}/submit`, { response });
export const reviewHomework = (id: string, input: { feedback?: string; grade?: string }) =>
  command(`/assignments/${encodeURIComponent(id)}/review`, input);
