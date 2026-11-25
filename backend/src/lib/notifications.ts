/**
 * Bell state shared rules. Notification *content* stays derived (activity feed plus
 * role rules in the frontend); the backend only stores per-user mute/read state.
 */

export const NOTIFICATION_CATEGORIES = [
  "approvals",
  "credits",
  "plans",
  "quality",
  "lessons",
  "requests",
  "homework",
  "feedback",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Same cap the browser store used, so one client cannot grow this row without bound. */
export const MAX_NOTIFICATION_READ_IDS = 300;

/** Dedupes and keeps the newest (last) ids, capped. */
export function normalizeReadIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].slice(-MAX_NOTIFICATION_READ_IDS);
}
