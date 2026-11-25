import { request } from "../../api/client";
import type { NotificationCategory } from "../notifications";
import type { ActivityEntry } from "../types";

export type NotificationStateDto = {
  mutedCategories: NotificationCategory[];
  readIds: string[];
};

/** Activity rows visible to the signed-in user (actor or target). */
export async function getNotificationFeed(limit = 50): Promise<ActivityEntry[]> {
  const response = await request<{ items: ActivityEntry[] }>(`/notifications?limit=${limit}`);
  return response.items;
}

export function getNotificationState(): Promise<NotificationStateDto> {
  return request<NotificationStateDto>("/notifications/state");
}

export function saveNotificationState(patch: Partial<NotificationStateDto>): Promise<NotificationStateDto> {
  return request<NotificationStateDto>("/notifications/state", { method: "PATCH", body: patch });
}
