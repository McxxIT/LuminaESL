import { activity } from "../db/schema";
import type { DbOrTx } from "./db-handle";

type UserStatus = "active" | "paused" | "inactive" | "archived";
type CourseStatus = "draft" | "published" | "archived";

/**
 * Every activity action the backend may log. Superset of the frontend demo names
 * (`frontend/app/lib/school` recordActivity) plus backend-only names. Keep in sync
 * when adding a mutation; demo logs `lesson.booked` for bookings, rebooks, and
 * scheduled lessons. `slot.closed` and `request.withdrawn` are backend-only.
 */
export type ActivityAction =
  | "absence.recorded"
  | "course.created"
  | "course.updated"
  | "course.duplicated"
  | `course.${CourseStatus}`
  | "credits.adjusted"
  | "credits.purchased"
  | "credits.refunded"
  | "enrollment.created"
  | "enrollment.updated"
  | "homework.assigned"
  | "homework.submitted"
  | "homework.reviewed"
  | "library.created"
  | "library.updated"
  | "library.archived"
  | "lesson.booked"
  | "lesson.cancelledByStudent"
  | "lesson.completed"
  | "lesson.libraryAttached"
  | "lesson.libraryDetached"
  | "lesson.planChanged"
  | "lesson.rated"
  | "lesson.rescheduled"
  | "manager.created"
  | "request.created"
  | "request.approved"
  | "request.rejected"
  | "request.withdrawn"
  | "school.imported"
  | "settings.updated"
  | "slot.opened"
  | "slot.closed"
  | "student.created"
  | "student.updated"
  | "student.reassigned"
  | "teacher.created"
  | "teacher.reassigned"
  | "teacher.updated"
  | "user.created"
  | "user.password_changed"
  | "user.password_reset"
  | "user.renamed"
  | "user.updated"
  | `user.${UserStatus}`;

export type ActivityInput = {
  actorId: string;
  action: ActivityAction;
  targetType: string;
  targetId: string;
  summary: string;
};

export async function logActivity(
  db: DbOrTx,
  input: ActivityInput,
): Promise<void> {
  await db.insert(activity).values(input);
}
