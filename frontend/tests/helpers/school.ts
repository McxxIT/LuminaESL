import { vi } from "vitest";
import {
  configureSchoolDataSource,
  configureSchoolStore,
  createMemoryAdapter,
  getSchoolSnapshot,
  type SchoolData,
} from "@/app/lib/school";
import { createSeedSchool } from "@/app/lib/school/seed";

/** A fixed "now" for date-dependent rules: Monday 2 March 2026, 09:00 local time. */
export const TEST_NOW = new Date(2026, 2, 2, 9, 0, 0);

/**
 * Fresh demo school in memory for one test: local data source (so an inherited
 * NEXT_PUBLIC_* env can never flip a service to its API branch) and a memory adapter
 * holding a newly built seed. Call it in `beforeEach`; nothing is shared between tests.
 */
export function freshSchool(now: Date = TEST_NOW) {
  configureSchoolDataSource("local");
  configureSchoolStore(createMemoryAdapter(createSeedSchool(now.toISOString())));
  return { snapshot: (): SchoolData => getSchoolSnapshot() };
}

/** Pin `Date` (and timers) to `now`. Pair with `vi.useRealTimers()` in `afterEach`. */
export function freezeTime(now: Date = TEST_NOW) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
}

/** Makes `Math.random` return `value`, so a room code is predictable. Restore with `vi.restoreAllMocks()`. */
export function stubRandom(value: number) {
  return vi.spyOn(Math, "random").mockReturnValue(value);
}

/** `yyyy-mm-dd` for `now` plus whole days, in local time (the format lessons and slots use). */
export function dayFrom(now: Date, days: number): string {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Narrow a `ServiceCall` to its sync result; local-branch services never return a promise. */
export function sync<T>(result: T | Promise<T>): T {
  if (result instanceof Promise) throw new Error("expected the local (synchronous) branch");
  return result;
}
