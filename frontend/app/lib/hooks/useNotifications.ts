"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isApiDataMode } from "../auth/mode";
import {
  getNotificationFeed,
  getNotificationState,
  saveNotificationState,
} from "../school/api/notifications";
import {
  activityNotification,
  mergeNotifications,
  notificationsForUser,
  type NotificationCategory,
  type SchoolData,
} from "../school";
import type { Account } from "../types";
import { useCurrentUser } from "./useCurrentUser";
import { usePersonalValue } from "./usePersonalValue";
import { useSchool, useSchoolData } from "./useSchool";

/** Manager/admin preferences (Profile + Settings pages). Shared with the bell through `usePersonalValue`. */
export type StaffPreferences = {
  phone: string;
  title: string;
  bio: string;
  mutedCategories: NotificationCategory[];
};

export const DEFAULT_STAFF_PREFERENCES: StaffPreferences = { phone: "", title: "", bio: "", mutedCategories: [] };
const NO_IDS: string[] = [];
const MAX_READ_IDS = 300;

export function staffPreferencesKey(email: string) {
  return `lumina-staff-preferences:${email.toLowerCase()}`;
}

/**
 * Role-aware notifications. Demo mode keeps per-browser read markers and muted categories;
 * API mode reads the activity feed and stores read/mute state on the backend.
 */
export function useNotifications(account: Account | null) {
  const api = isApiDataMode();
  const email = account?.email.toLowerCase() ?? "anonymous";
  const user = useCurrentUser(account);
  const data = useSchoolData();
  const [prefs] = usePersonalValue<StaffPreferences>(staffPreferencesKey(email), DEFAULT_STAFF_PREFERENCES);
  const [localReadIds, setLocalReadIds] = usePersonalValue<string[]>(`lumina-notifications-read:${email}`, NO_IDS);
  const [serverReadIds, setServerReadIds] = useState<string[]>(NO_IDS);
  const [serverMuted, setServerMuted] = useState<NotificationCategory[]>([]);
  const [feed, setFeed] = useState<ReturnType<typeof activityNotification>[]>([]);
  const isStaff = user?.role === "admin" || user?.role === "manager";

  const muted = useMemo(
    () => (api ? serverMuted : isStaff ? prefs.mutedCategories : []),
    [api, serverMuted, isStaff, prefs.mutedCategories],
  );

  const select = useCallback((snapshot: SchoolData) => notificationsForUser(snapshot, user, muted), [user, muted]);
  const derived = useSchool(select);

  useEffect(() => {
    if (!api || !account?.email) return;
    let active = true;
    Promise.all([getNotificationFeed(), getNotificationState()])
      .then(([rows, state]) => {
        if (!active) return;
        setFeed(rows.map((row) => activityNotification(row, user?.role ?? "student")));
        setServerReadIds(state.readIds);
        setServerMuted(state.mutedCategories);
      })
      .catch(() => {
        // Feed is additive: keep the derived items if the route is unavailable.
        if (!active) return;
        setFeed([]);
      });
    return () => { active = false; };
    // Refetch after each bootstrap refresh; `seededAt` changes on every API response.
  }, [api, account?.email, user?.role, data.seededAt]);

  const items = useMemo(
    () => (api ? mergeNotifications(derived, feed, muted) : derived),
    [api, derived, feed, muted],
  );

  const readIds = api ? serverReadIds : localReadIds;

  const notifications = useMemo(() => {
    const read = new Set(readIds);
    return items.map((item) => ({ ...item, unread: !read.has(item.id) }));
  }, [items, readIds]);

  const markRead = useCallback((id: string) => {
    if (api) {
      setServerReadIds((current) => {
        if (current.includes(id)) return current;
        const next = [...current, id].slice(-MAX_READ_IDS);
        void saveNotificationState({ readIds: next }).catch(() => {});
        return next;
      });
      return;
    }
    setLocalReadIds((current) => current.includes(id) ? current : [...current, id].slice(-MAX_READ_IDS));
  }, [api, setLocalReadIds]);

  const markAllRead = useCallback(() => {
    const ids = items.map((item) => item.id);
    if (api) {
      setServerReadIds((current) => {
        const next = [...new Set([...current, ...ids])].slice(-MAX_READ_IDS);
        void saveNotificationState({ readIds: next }).catch(() => {});
        return next;
      });
      return;
    }
    setLocalReadIds((current) => [...new Set([...current, ...ids])].slice(-MAX_READ_IDS));
  }, [api, items, setLocalReadIds]);

  return { notifications, unreadCount: notifications.filter((item) => item.unread).length, markRead, markAllRead };
}
