---
name: plan:step-c-uploads-notifications
description: "COMPLEX plan: API-backed uploads/downloads, activity-fed notifications, per-user read/mute state on the backend"
date: 18-11-26
feature: backend-cutover
status: COMPLETE (executed and archived 18-11-26; see step-c-uploads-notifications_REPORT_18-11-26.md)
---

# Step C — Uploads and Notifications

**Date**: 18-11-26
**Status**: COMPLETE — executed, all gates green, archived; commit pending.
**Complexity**: COMPLEX (backend migration + new API surface + async frontend hooks + smoke extension)
**Branch**: developing
**Umbrella**: `frontend/CUTOVER_PLAN.md` §Step C (items 3, 4) and `frontend/CUTOVER_PROGRESS.md` board row "Step C".
**Execution Model**: single vc-execute-agent, sequential: WS-U uploads, WS-N notifications, WS-S smoke, V verification.

TL;DR: The backend already has `/uploads` and `/notifications`, but the frontend ignores both. Step C makes API mode upload bytes to the server instead of IndexedDB, download through the authenticated endpoint, feed the bell from `GET /notifications` merged with the existing role derivation, and persist read/mute state per user in Postgres instead of localStorage. Demo/local behavior must not change.

## Overview

B3 finished every school write domain, but two surfaces still run only in the browser:

1. **Uploads.** `services/uploads.ts` validates a `File`, converts it to a data URL, saves the bytes in IndexedDB (`files.ts`), and only then records metadata. `ManagerCurriculum.downloadFile` and `TeacherLessons.downloadPlanFile` read those bytes back with `readFileAsync`. The backend `POST /uploads` + `GET /uploads/:id/download` routes exist and are unused. Result: in API mode an upload writes bytes to the wrong place and a download silently reports "not available in this browser". Cancellation evidence is worse: `views.attachmentView` reads bytes synchronously from `localStorage`, so API-mode managers never see the attachment.

2. **Notifications.** `useNotifications` derives items from the role-scoped bootstrap and stores read ids and muted categories in `localStorage`. `GET /notifications` returns activity rows scoped to `actorId = user` or `targetId = user`, but nothing calls it and there is no per-user state table. Read/mute state does not follow a user across devices, and the activity log never reaches the bell.

Step C closes both without bumping `SCHOOL_SCHEMA_VERSION` (the bootstrap payload shape does not change).

## Goals

- API mode uploads lesson-plan files and cancellation evidence to `POST /uploads`; no file bytes are written to IndexedDB or `localStorage`.
- API mode downloads lesson-plan files and cancellation evidence through `GET /uploads/:id/download` with auth.
- `useNotifications` consumes `GET /notifications` in API mode, merged with the existing per-role derivation, so no current notification disappears.
- Read and muted-category state live in Postgres per user and survive reload, browser change, and device change.
- Demo/local mode is byte-for-byte behavior-compatible: IndexedDB uploads/downloads, localStorage read/mute.
- `npm run smoke` gains uploads and notifications domains; every new route has a role/allowed/denied check.
- No reset/push/truncate in smoke; no new dependencies.

## Scope

In:
- Backend: server-side upload validation, notification state table + routes, smoke scenarios.
- Frontend: API clients for uploads/notifications, API branches in upload/download paths, notification merge + server state, cancellation evidence display in API mode.

Out (recorded, not built here):
- Notification generation server-side for every derived event (low credits, next lesson, missing plan). The derivation remains.
- Email/push notification delivery, websockets, unread badges beyond the current bell count.
- Attachment access-control hardening beyond the existing authenticated endpoints (see Risks; backlog note if it survives).
- Orphaned upload cleanup and migration of existing IndexedDB blobs (Step D owns import/removal).
- Frontend test runner (R1, still a backlog stub) — browser checks stay Agent-Probe.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Bell shows **merged** items: activity feed (server) + existing derived items, deduped by `targetType:targetId:action`/`id`, sorted by `at`, capped 30 | Checkbox says feed from `/notifications`; "keep the per-role derivation until the activity log covers every event" means merge, not replace |
| D2 | Read/mute state in a new `notification_state` table with `GET/PATCH /notifications/state` | Per-user across devices; mirrors the existing "one row per user" profile pattern |
| D3 | Upload limit 5 MB server-side, allowlist `pdf, image/*, msword, docx, pptx` | Matches `MAX_UPLOAD_BYTES` and the client accept regex; currently the server accepts 25 MB and any type |
| D4 | No `SCHOOL_SCHEMA_VERSION` bump | Bootstrap collections/settings are unchanged; notification state is a separate endpoint |
| D5 | Read ids are opaque strings capped at 300 (same cap as today's client) | Derived ids include values like `credits-<id>-<balance>`; capping prevents unbounded growth |
| D6 | Activity mapping uses `action` prefix → category/icon; `targetType` → nav page | Keeps the mapping in one frontend module, not in the DB |

## Context Loaded

`process/context/all-context.md`, `process/context/uxui/all-uxui.md` + `uxui/school-data-layer.md`, `process/context/auth/all-auth.md`, `process/context/database/all-database.md`, `process/context/tests/all-tests.md`, `process/development-protocols/{all-development-protocols,implementation-standards,plan-lifecycle}.md`. Code: `backend/src/routes/{uploads,notifications,school,courses,requests}.ts`, `backend/src/app.ts`, `backend/src/db/schema.ts`, `backend/scripts/smoke.ts`, `frontend/app/lib/{api/client,school/files,school/notifications,school/services/uploads,school/services/curriculum,school/views}.ts`, `frontend/app/components/{manager/ManagerCurriculum,manager/ManagerApprovals,teacher/TeacherLessons}.tsx`, `frontend/app/lib/hooks/{useNotifications,usePersonalValue}.ts`.

## Architecture Notes

### Uploads (API mode)
`File` -> client-side size/type check (keep) -> `api/uploads.ts uploadFile(file)` -> `FormData` to `POST /uploads` -> backend validates MIME/size, writes `UPLOAD_DIR/<uuid><ext>`, inserts `attachments` row -> response metadata `{ id, name, type, size, storageKey, uploadedBy, uploadedAt }` -> `attachFileToPlan` writes only metadata to the plan (existing curriculum route). No bytes touch browser storage.

Download: attachment id -> `requestBlob("/uploads/<id>/download")` (auth header + 401 refresh, same retry contract as `request`) -> `Blob` -> temporary object URL -> anchor click -> `URL.revokeObjectURL`. Cancellation evidence downloads on demand instead of rendering a stored data URL.

### Notifications (API mode)
`GET /notifications` -> activity rows -> `activityNotification(row)` maps `action` family to `{ category, icon, title, detail, nav }`, `at = createdAt`, `id = "act-" + row.id`. Merge with `notificationsForUser(...)`, dedupe, apply muted categories, sort, slice 30. Read ids come from `GET /notifications/state`; `markRead`/`markAllRead` optimistically update and `PATCH /notifications/state`. Mute toggles in Settings/Profile call the same PATCH in API mode. Demo mode keeps `usePersonalValue`.

Mapping table (initial):
- `request.*`, `absence.*` -> `approvals` / check / Approvals
- `lesson.booked|cancelledByStudent|rescheduled` -> `lessons` / calendar / Lessons
- `lesson.completed` -> `lessons` / check / Lessons
- `lesson.rated` -> `feedback` / star / Analytics (teacher) / Performance (manager)
- `homework.*` -> `homework` / book / Assignments or Students
- `credits.*` -> `credits` / wallet / Billing or Students
- `course.*`, `enrollment.*` -> `plans` / file / Curriculum
- `user.*`, `teacher.*`, `student.*`, `manager.*` -> `plans` / file / People
- `settings.updated`, `slot.*` -> `lessons` / calendar / Settings or Booking slots

Nav must use page names the current shell accepts; executor verifies against `LuminaApp` nav handling.

### Notification state schema
`notification_state`: `user_id uuid PK references users(id) on delete cascade`, `muted_categories text[] not null default '{}'`, `read_ids text[] not null default '{}'`, `updated_at timestamptz not null default now()`.
`GET /notifications/state` -> `{ mutedCategories, readIds }` (defaults when absent). `PATCH` -> zod `{ mutedCategories?: NotificationCategory[], readIds?: string[] }`, validates categories against the union, trims `readIds` to the last 300, upserts one row, returns the stored state. Auth required; no role restriction (a user only reads/writes their own row).

## Touchpoints

Backend:
- `backend/src/db/schema.ts` — `notificationState` table.
- `backend/src/db/migrations/0002_notification_state.sql` + `meta/_journal.json` + snapshot (generate with `npm run db:generate`; do not hand-edit the snapshot).
- `backend/src/routes/notifications.ts` — `GET /state`, `PATCH /state`; keep `GET /`.
- `backend/src/routes/uploads.ts` — 5 MB + MIME allowlist validation with stable 4xx messages; keep `GET /:id` and `/:id/download`.
- `backend/src/app.ts` — multipart `fileSize` 5 MB (only uploads use multipart).
- `backend/src/lib/notifications.ts` (new, optional) — shared category union/allowlist so route validation and tests use one source.
- `backend/scripts/smoke.ts` — `uploads` and `notifications` scenarios.
- `backend/tests/contract.test.ts` — new routes require auth (401), existing bootstrap contract unchanged.

Frontend:
- `frontend/app/lib/api/client.ts` — `requestBlob(path)` with the same refresh-on-401 contract.
- `frontend/app/lib/school/api/uploads.ts` (new) — `uploadFile(file)`, `downloadAttachmentFile(id): Promise<Blob>`.
- `frontend/app/lib/school/api/notifications.ts` (new) — `getNotificationFeed()`, `getNotificationState()`, `saveNotificationState(patch)`.
- `frontend/app/lib/school/services/uploads.ts` — API branch: client validation -> `uploadFile` -> `attachFileToPlan`; local branch unchanged.
- `frontend/app/lib/school/services/curriculum.ts` — remove the unreachable duplicate `isApiDataMode()` branch in `attachFileToPlan`.
- `frontend/app/lib/school/notifications.ts` — export `activityNotification(row)` + `mergeNotifications(derived, activity, muted)`.
- `frontend/app/lib/hooks/useNotifications.ts` — API-mode feed + server state; demo unchanged; expose `muting`/`setMutedCategories` or reuse prefs.
- `frontend/app/components/manager/ManagerCurriculum.tsx`, `teacher/TeacherLessons.tsx` — download branches.
- `frontend/app/components/manager/ManagerApprovals.tsx` (+ `views.attachmentView`) — API-mode cancellation evidence via download link.
- `frontend/app/components/manager/{ManagerProfile,ManagerSettings}.tsx` — mute write-through in API mode.
- `frontend/app/lib/school/index.ts` — export only if public helpers are needed.

## Public Contracts

- New: `GET /api/v1/notifications/state` -> `{ mutedCategories: string[], readIds: string[] }`; `PATCH /api/v1/notifications/state` body `{ mutedCategories?: string[], readIds?: string[] }` -> same shape. Auth required.
- Changed: `POST /uploads` now rejects >5 MB (`413` or `400` mapped by Fastify; executor pins the exact code and smoke asserts it) and unsupported MIME (`400`).
- Unchanged: `GET /uploads/:id`, `GET /uploads/:id/download`, `GET /notifications`, bootstrap collections/keys, `SCHOOL_SCHEMA_VERSION` 3.

## Blast Radius

- Existing code touched: notifications hook (bell + Settings + Profile), upload/download UI in three components, upload route validation, app multipart limit, smoke script, schema + one migration.
- Data: one new table; no changes to existing tables or rows.
- Risk classes: public API behavior (new state route), file handling (validated uploads), auth (no auth code change, but new authenticated route), migration (additive).
- Demo/local mode must remain untouched; the local branch of every touched service stays as-is.

## Implementation Checklist

### WS-U Uploads
- [x] U1 Backend: enforce 5 MB + MIME allowlist in `POST /uploads`; set multipart limit to 5 MB; return clear errors.
- [x] U2 `requestBlob` in the API client with 401 refresh retry; no JSON parse on binary.
- [x] U3 `api/uploads.ts` upload/download helpers (FormData, blob, filename from `Content-Disposition` when present).
- [x] U4 `services/uploads.ts` API branch: validate, upload, attach metadata; never call `saveLargeFile` in API mode.
- [x] U5 ManagerCurriculum + TeacherLessons download: API blob path; demo path unchanged; revoke object URLs.
- [x] U6 ManagerApprovals cancellation evidence: fetch on demand in API mode (link/button + loading/error notice); demo unchanged. Add attachment id to the view shape rather than a data URL.
- [x] U7 Remove the unreachable duplicate branch in `attachFileToPlan`.

### WS-N Notifications
- [x] N1 Schema + migration for `notification_state`; `npm run db:generate` keeps the snapshot consistent.
- [x] N2 `GET/PATCH /notifications/state` with zod validation, category allowlist, 300-id cap, upsert.
- [x] N3 Frontend API client for feed/state.
- [x] N4 `activityNotification` mapping + `mergeNotifications` with dedupe/sort/cap; unit-testable pure function.
- [x] N5 `useNotifications`: API mode fetch feed + state on mount/refresh; optimistic read/mute with PATCH; demo mode keeps `usePersonalValue`.
- [x] N6 Settings/Profile mute toggles write through in API mode; bell reflects immediately.
- [x] N7 Unread count includes activity items; no crash when the feed request fails (fall back to derived items).

### WS-S Smoke and Tests
- [x] S1 `uploads` domain: manager uploads a fixture (multipart), metadata returned, plan attach works, `GET /:id/download` bytes match, anonymous 401, oversize/type rejected, no activity row (uploads are not logged today — assert current behavior).
- [x] S2 `notifications` domain: seed at least one actor-visible and one target-visible activity row; `GET /` scoping (own rows only), `GET /state` defaults empty, `PATCH /state` roundtrip persists after a new request, invalid category 400, >300 ids trimmed, anonymous 401.
- [x] S3 `contract.test.ts`: new state routes 401 without token; bootstrap keys/version unchanged.
- [x] S4 Update smoke header/domain count and `frontend/CUTOVER_PROGRESS.md` (board row, checklist, verification log, change log) after green.

### V Verification
- [x] V1 `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend`, `git diff --check`.
- [x] V2 `npm run smoke` twice (13 domains), settings restored, port 4100 free; one deliberate red run for a new check, reverted.
- [x] V3 Browser API mode: manager uploads a plan file -> row appears -> download opens the correct bytes; teacher downloads the same file; student/manager sees cancellation evidence attached in API mode; bell shows an activity item; mark read survives reload; mute survives reload and hides the category.
- [x] V4 Browser demo mode: upload/download still uses IndexedDB; bell read/mute still localStorage; no console errors.
- [x] V5 Grep gate for reset/push/truncate; no env file edits; servers stopped.
- [x] V6 Context/doc edits discovered during execution are recorded for UPDATE PROCESS (not silently applied).

## Acceptance Criteria (umbrella mapping)

| Umbrella checkbox | Proving gate |
|---|---|
| Replace IndexedDB bytes with `POST /uploads` / `GET /:id/download`; keep attachment ids | S1 + V3 (API) + V4 (demo unchanged) |
| Feed `useNotifications` from `GET /notifications`, keep derivation | N4/N5 + V3 bell check with an activity-only item |
| Decide and implement read/mute storage per user on the backend | N1/N2 + S2 + V3 reload/device check |
| Support "every current write service has a branch" (regression) | `typecheck`, `lint`, backend tests, smoke |

## Validate Contract

Executable contract checked at EXECUTE close; evidence lives in
`step-c-uploads-notifications_REPORT_18-11-26.md`.

| Contract item | Command / probe | Pass condition |
|---|---|---|
| C1 Uploads accept allowed types and enforce 5 MB | `npm run smoke` (`uploads` domain) | 16/16 checks; `201` + byte-identical download; oversize/wrong type rejected |
| C2 Notification state round-trips per user | `npm run smoke` (`notifications` domain) | 21/21 checks; partial `PATCH`; invalid category `400`; `401` without token |
| C3 Routes exist and are authenticated | `npm run test --workspace @lumina/backend` | 17/17 tests; contract test covers `uploads` and `notifications/state` |
| C4 Bell merges activity feed with the role derivation | Browser probe, API mode (admin) | merged panel ≤30 items; read state persists after reload |
| C5 Mute is per user and server-backed | Browser probe + `GET /notifications/state` | muted category persists after reload |
| C6 Demo mode unchanged | Browser probe, `.env.local` defaults | IndexedDB upload/download and localStorage read/mute survive reload |
| C7 Code hygiene | `npm run typecheck`, `npm run lint`, `git diff --check`, grep gate | all exit 0; no added `reset|push|truncate` |
| C8 Migration is additive and applies | `npm run db:generate` (clean) + `npm run db:migrate` | only `0002_notification_state.sql`; applies to the dev DB |

## Verification Evidence

| Gate | Strategy | Command/Probe |
|---|---|---|
| Types | Fully-Automated | `npm run typecheck` |
| Lint | Fully-Automated | `npm run lint` |
| Backend unit/contract | Fully-Automated | `npm run test --workspace @lumina/backend` |
| Diff hygiene | Fully-Automated | `git diff --check` |
| Uploads live | Fully-Automated | `npm run smoke` (uploads domain) |
| Notifications live | Fully-Automated | `npm run smoke` (notifications domain) |
| Smoke twice/idempotent | Fully-Automated | run twice, compare domain counts |
| Deliberate red | Fully-Automated | break one expectation, assert exit 1, revert |
| Browser API | Hybrid/Agent-Probe | upload, download, evidence, bell read/mute (1440px + 390px) |
| Browser demo | Hybrid/Agent-Probe | upload/download + bell regression |
| Migration | Fully-Automated | `npm run db:generate` clean; `db:migrate` applies on the dev DB |
| No destructive SQL | Agent-Probe | grep gate (`reset|push|truncate`) |

## Phase Completion Rules

- A workstream is NOT complete while any of its checklist boxes is open or its Validate Contract row is red.
- The phase is NOT complete until C1-C8 are green in one run, the deliberate-red control failed as expected, and the report records the evidence.
- No phase completion without the demo-mode regression (C6). API work must never silently change local mode.
- Any code change after the last green run re-opens the affected gates; re-run them before declaring DONE.
- `process/context/**` edits and plan archiving are UPDATE PROCESS work, not part of the EXECUTE green.

## Dependencies and Sequencing

Backend first (U1, N1, N2, S3), then frontend clients (U2-U3, N3), then branches/UI (U4-U7, N4-N6), then smoke (S1-S2), then V. `db:generate` must run after the schema edit and before any live test. If migration generation rewrites unrelated snapshots, stop and report.

## Risks

- **Auth on binary download.** A plain `<a href>` cannot send the bearer token. All API-mode downloads must go through `requestBlob`; a direct link returns 401. Mitigation: one shared helper used by all three call sites; browser check covers each.
- **Notification duplication.** Derived and activity items can describe the same event. Mitigation: deterministic dedupe key; N4 takes the derived item's richer copy when both exist.
- **Id churn.** Derived ids embed balances/counts (`credits-<student>-<balance>`), so read markers reset when the value changes. Accepted; cap prevents growth.
- **Multipart limit mismatch.** Global 5 MB could reject future upload kinds. Only `/uploads` uses multipart; if a larger limit is needed later, move the limit to the route.
- **Migration drift.** Hand-written migrations desync drizzle's snapshot. Mitigation: `db:generate` only; review the generated SQL.
- **Attachment access scope.** Any authenticated user who knows an attachment UUID can download it. This matches the current bootstrap scoping intent but is not enforced at download. Record as a backlog note if not trivially fixable; do not silently expand scope.
- **Browser-check environment.** Next 16 allows one dev server per project folder; reuse the B3 temporary-copy technique or stop the dev server first.

## Resume and Execution Handoff

Status: COMPLETE and archived 18-11-26. Evidence: `step-c-uploads-notifications_REPORT_18-11-26.md`.

If this plan is resumed or replayed:

- Re-read `frontend/CUTOVER_PROGRESS.md` (Step C section) and the report's browser evidence before touching code.
- Commands to stay green after every slice: `npm run typecheck`; `npm run lint`; `npm run test --workspace @lumina/backend`; `git diff --check`; `npm run smoke` (needs local Postgres + backend env file, port 4100 free).
- Do not touch `process/context/**` during EXECUTE; collect the list for UPDATE PROCESS.
- Next step (now unblocked): Step D in `frontend/CUTOVER_PLAN.md` — parity suite, one-time import from `lumina-school:v1`/IndexedDB, remove the browser-store fallback.
