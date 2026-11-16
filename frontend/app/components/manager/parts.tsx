import { initials } from "../../lib/student";
import type { TeacherPerformance } from "../../lib/teacherPerformance";
import type { LessonStatus, UserStatus } from "../../lib/school";

export function PersonAvatar({ name, color, size = "default" }: { name: string; color: string; size?: "default" | "small" }) {
  return <div className={`avatar avatar-${color} ${size === "small" ? "manager-avatar-small" : ""}`}>{initials(name)}</div>;
}

/** Performance score with tier colour, e.g. "81 · Good". */
export function ScorePill({ performance }: { performance: Pick<TeacherPerformance, "score" | "tier"> }) {
  const tier = performance.tier.toLowerCase().replace(" ", "-");
  return <span className={`teacher-tier-pill tier-${tier} manager-score-pill`} title={`Performance score ${performance.score}/100`}>{performance.score} · {performance.tier}</span>;
}

const userStatusLabel: Record<UserStatus, string> = { active: "Active", paused: "Paused", archived: "Archived" };

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return <span className={`manager-status manager-status-${status}`}>{userStatusLabel[status]}</span>;
}

const lessonStatusLabel: Record<LessonStatus, string> = { scheduled: "Scheduled", live: "Live", completed: "Completed", cancelled: "Cancelled" };

export function LessonStatusBadge({ status }: { status: LessonStatus }) {
  return <span className={`manager-lesson-status manager-lesson-status-${status}`}>{lessonStatusLabel[status]}</span>;
}

/** First name, for greetings. */
export function firstName(name: string) {
  return name.split(" ")[0] ?? name;
}
