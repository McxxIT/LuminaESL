/**
 * Public API of the shared school layer. Screens import from here (or from the hooks in
 * `app/lib/hooks`), never from `adapter.ts` or `localStorage` directly.
 */
export * from "./types";
export * from "./selectors";
export { can, assertCan, PermissionError, type SchoolAction, type PermissionTarget } from "./permissions";
export { getSchoolSnapshot, subscribeSchool, updateSchool, resetSchool, configureSchoolStore, SCHOOL_STORAGE_KEY } from "./store";
export { createId, recordActivity } from "./repositories";
export { createLocalStorageAdapter, createMemoryAdapter, type StorageAdapter } from "./adapter";
export { SEED_IDS } from "./seed";
export { nameOf, lessonMaterialView, toTeacherLessonView, performanceForTeacher, attachmentView, teacherScheduleView, toStudentLessonView, studentLessonsView, creditTransactionsView, teamWeekView, weekStartFor, openSlotsForTeacher, performanceRules, toStudentAssignmentView, toTeacherHomeworkView, type TeamWeekDay, type TeamWeekItem } from "./views";
export { notificationsForUser, type SchoolNotification, type NotificationCategory } from "./notifications";
