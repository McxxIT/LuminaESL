---
name: context:uxui-school-data-layer
description: "lib/school store, ServiceResult services, and the dual local/API branches that must be mirrored"
keywords: school store, useSyncExternalStore, ServiceResult, service, isApiDataMode, local branch, api branch, bootstrap, permissions, adapter, repositories
related: [context:all-uxui, context:auth-demo-vs-api-mode, context:database-booking-and-credit-integrity]
date: 17-11-26
---

# School Data Layer

BLUF: `frontend/app/lib/school/` is the data layer. Every service returns `ServiceResult<T>` and branches on `isApiDataMode()`: API branch -> `lib/school/api/*`; local branch -> `updateSchool(draft => ...)`. A change to one branch usually needs the same change in the other.

## Pieces

- `store.ts`: external store (`useSyncExternalStore`), `StorageAdapter` (default localStorage key `lumina-school:v1`), `SchoolData {version, seededAt, settings, collections{...}}`, `dataSource` `"local" | "api"`, `updateSchool`.
- `adapter.ts`, `repositories.ts` (`get`, `patch`, `recordActivity`), `selectors.ts`, `views.ts`, `seed.ts`, `migrate.ts`, `files.ts`, `notifications.ts`.
- `types.ts`: shared with the backend contract test (`backend/tests/contract.test.ts` imports it) — changing collection keys or settings keys fails that test unless the backend bootstrap matches; `SCHOOL_SCHEMA_VERSION` guards drift.
- `permissions.ts`: `assertCan` / `can` (see `auth/roles-and-scope.md`).
- `api/`: `bootstrap.ts`, `bookings.ts`, `credits.ts`, `approvals.ts`, `homework.ts`, `teaching.ts`, `curriculum.ts`, `uploads.ts`, `notifications.ts`, `school.ts` over `lib/api/client.ts` (`ApiError`, `requestBlob` for authenticated binary downloads).
- `attachment-download.ts`: shared downloader (`downloadAttachmentFile`, `useAttachmentObjectUrl`). API mode fetches the blob with the access token; demo mode reads IndexedDB/localStorage. All plan-file, lesson-material, and cancellation-evidence call sites use it.

## Services (`services/*`)

approvals, bookings, credits, curriculum, homework, people, profile, quality, teaching, uploads, plus `common.ts` (`changeCredits`, `assertSlotOpen`, `createLesson`, `hoursUntil`, `LESSON_CREDIT_HOURS` = 1 credit per lesson) and `result.ts`. `SCHOOL_SCHEMA_VERSION` is 3 (bumped in B3; a stale browser store re-seeds). API mode: `rateLesson` and cancellation-request attachments go through `api/teaching.ts`; plan-file uploads go through `api/uploads.ts`; the bell reads `api/notifications.ts` and merges the activity feed with `notificationsForUser`.

`result.ts`: `ok()/fail()`, `ServiceError`, `run()` (sync) and `runAsync()` (async) convert `ServiceError`, `PermissionError`, `ApiError` into `{ok:false,error}` so screens show a toast instead of catching.

## Pattern (see `services/bookings.ts` `bookLesson`)

```
if (isApiDataMode()) return runAsync(async () => await apiCall(...));
return run(() => updateSchool(draft => { assertCan(...); ...mutate draft... }));
```

## Rules

- New service: implement both branches, call `assertCan` in the local branch, return `ServiceResult`.
- Demo data stays out of API mode: `upgrade()` seeds a missing collection only when
  `dataSource === "local"`, and `resetSchool()` logs a warning and returns the current snapshot in API
  mode. Do not re-seed an API cache; refresh from `/school/bootstrap` instead.
- Credit and refund math in the local branch must mirror the backend (`database/booking-and-credit-integrity.md`).
- API branch must never touch seed/local data (`auth/demo-vs-api-mode.md`).
- Legacy helpers still present: `lib/data.ts`, `student.ts`, `scheduling.ts`, `teacherPerformance.ts`. Migration status: `frontend/CUTOVER_PROGRESS.md`.
