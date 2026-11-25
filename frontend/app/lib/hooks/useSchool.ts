"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getSchoolSnapshot, getServerSchoolSnapshot, subscribeSchool } from "../school/store";
import type { SchoolData } from "../school/types";

/** The whole school snapshot. Re-renders whenever any service changes data (in this or another tab). */
export function useSchoolData(): SchoolData {
  return useSyncExternalStore(subscribeSchool, getSchoolSnapshot, getServerSchoolSnapshot);
}

/** False during server rendering and the first client render, before stored data is read. */
export function useSchoolReady(): boolean {
  return useSchoolData().seededAt !== "";
}

/**
 * Derive a value from the school snapshot. Recomputed when the snapshot or the selector changes,
 * so wrap selectors that close over props in `useCallback`:
 *
 *   const select = useCallback((data: SchoolData) => lessonsForTeacher(data, teacherId), [teacherId]);
 *   const lessons = useSchool(select);
 */
export function useSchool<T>(selector: (data: SchoolData) => T): T {
  const data = useSchoolData();
  return useMemo(() => selector(data), [data, selector]);
}
