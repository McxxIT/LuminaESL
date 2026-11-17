const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidClockTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function addMinutes(time: string, minutes: number): string {
  const match = TIME_PATTERN.exec(time);
  if (!match) throw new Error(`Invalid clock time: ${time}`);
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  const total = (hours * 60 + mins + minutes) % (24 * 60);
  const nextHours = Math.floor(total / 60);
  const nextMinutes = total % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

export const LESSON_MINUTES = 25;

/** Local start of a dated clock slot, e.g. `2026-11-18` + `09:30`. */
export function slotStartDate(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

/** Hours from `now` until the slot starts (negative once it has started). */
export function hoursUntil(date: string, time: string, now = new Date()): number {
  return (slotStartDate(date, time).getTime() - now.getTime()) / 3_600_000;
}
