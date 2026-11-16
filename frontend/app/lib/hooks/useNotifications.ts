"use client";

import { useCallback, useMemo } from "react";
import { notificationsForUser, type NotificationCategory, type SchoolData } from "../school";
import type { Account } from "../types";
import { useCurrentUser } from "./useCurrentUser";
import { usePersonalValue } from "./usePersonalValue";
import { useSchool } from "./useSchool";

/** Manager/admin preferences (Profile + Settings pages). Shared with the bell through `usePersonalValue`. */
export type StaffPreferences = {
  phone: string;
  title: string;
  bio: string;
  mutedCategories: NotificationCategory[];
};

export const DEFAULT_STAFF_PREFERENCES: StaffPreferences = { phone: "", title: "", bio: "", mutedCategories: [] };
const NO_IDS: string[] = [];

export function staffPreferencesKey(email: string) {
  return `lumina-staff-preferences:${email.toLowerCase()}`;
}

/** Role-aware notifications with per-account read markers and muted categories. */
export function useNotifications(account: Account | null) {
  const email = account?.email.toLowerCase() ?? "anonymous";
  const user = useCurrentUser(account);
  const [prefs] = usePersonalValue<StaffPreferences>(staffPreferencesKey(email), DEFAULT_STAFF_PREFERENCES);
  const [readIds, setReadIds] = usePersonalValue<string[]>(`lumina-notifications-read:${email}`, NO_IDS);
  const isStaff = user?.role === "admin" || user?.role === "manager";
  const muted = isStaff ? prefs.mutedCategories : undefined;
  const select = useCallback((data: SchoolData) => notificationsForUser(data, user, muted), [user, muted]);
  const items = useSchool(select);

  const notifications = useMemo(() => {
    const read = new Set(readIds);
    return items.map((item) => ({ ...item, unread: !read.has(item.id) }));
  }, [items, readIds]);

  const markRead = useCallback((id: string) => setReadIds((current) => current.includes(id) ? current : [...current, id].slice(-300)), [setReadIds]);
  const markAllRead = useCallback(() => setReadIds((current) => [...new Set([...current, ...items.map((item) => item.id)])].slice(-300)), [setReadIds, items]);

  return { notifications, unreadCount: notifications.filter((item) => item.unread).length, markRead, markAllRead };
}
