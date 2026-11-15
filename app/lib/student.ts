export function toISODate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function todayISO() {
  return toISODate(new Date());
}

export function isoDaysFromNow(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return toISODate(date);
}

export function parseISODate(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function formatLessonDate(value: string) {
  if (!value) return "Date to be confirmed";
  const date = parseISODate(value);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (value === toISODate(today)) return "Today";
  if (value === toISODate(tomorrow)) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function formatLongDate(value: string) {
  if (!value) return "Date to be confirmed";
  return parseISODate(value).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function formatDateInput(value: string) {
  return formatLessonDate(value);
}

export function addMinutes(time: string, minutes: number) {
  const [hours, mins] = time.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  const nextHours = Math.floor(total / 60) % 24;
  const nextMins = total % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMins).padStart(2, "0")}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function downloadTextFile(filename: string, content: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function friendlyRole(role: string) {
  if (role === "admin") return "School admin";
  if (role === "teacher") return "Teacher";
  return "Student";
}
