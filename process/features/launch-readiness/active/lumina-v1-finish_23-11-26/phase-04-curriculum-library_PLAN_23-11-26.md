---
name: plan:lumina-v1-finish-phase-04-curriculum-library
description: "Lumina ESL v1 Finish — Phase 04: Curriculum Library (one global school-wide library; admin/manager upload + attach to lessons; teacher/student view and download of linked materials)"
date: 23-11-26
metadata:
  node_type: memory
  type: plan
  feature: launch-readiness
  phase: phase-04
---

# Phase 04 — Curriculum Library

**Program:** lumina-v1-finish
**Umbrella plan:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md
**Phase status:** ✅ VERIFIED (with gaps) 24-11-26 — Steps A–F executed, independent EVL #2 green, review decision approved-with-concerns (user); known gaps: AC-11 API-mode visual probe pending, backlog notes written
**Report destination:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-04-curriculum-library_REPORT_23-11-26.md (flat in the program task folder)

---

## Purpose

Build the Curriculum Library end-to-end across PostgreSQL, Fastify API, and both API and demo frontend modes, per the locked user decisions of 24-11-26:

- **Admin and managers** upload and manage reusable materials in ONE global, school-wide library (title, free-text category, optional level, description, tags, one file per item). Edit/archive is allowed for the item creator or admin.
- **Managers and admin attach/detach** library items to lessons: admin any lesson; a manager only lessons whose teacher is on their team. **Teachers do NOT attach** (this overrides the earlier INNOVATE teacher-attach proposal).
- **Teachers** view/download materials linked to their own lessons. **Students** (parents via the student account) view/download materials linked to their own lessons whose status is not `cancelled`.
- Archive-only (no hard delete). Archiving hides an item from browse and from new attaches; existing links keep access; file bytes are never deleted. Links are NOT copied on booking/rebook. Demo library seed is empty.

---

## Locked Decisions (authoritative; no creative decisions at EXECUTE)

| # | Decision |
|---|---|
| D1 | One global library; create = admin + manager; edit/archive/unarchive = creator or admin |
| D2 | Attach/detach = admin (any lesson) + manager (lessons of own-team teachers via `managerOwnsTeacher`). Teacher/student attach = 403. No teacher picker UI |
| D3 | Student sees linked materials of own lessons with `status != 'cancelled'` (scheduled, live, completed). Teacher rule is identical for their own lessons (consistency) |
| D4 | Archive-only; links not copied on booking/rebook; demo library seed empty |
| D5 | One file per item, no file replace (archive + create new item) |
| D6 | No `GET /library` route: the role-scoped bootstrap carries all library data (single read path, mirrors every other collection) |
| D7 | `SCHOOL_SCHEMA_VERSION` stays 3; `school-import.ts` unchanged (unknown keys are stripped; demo library data does not import: accepted known gap, backlog stub) |
| D8 | `lessons.ts`, `bookings.ts`, `uploads.ts`, `school-import.ts` are NOT modified |

---

## Entry Gate

- Phase 02 complete (scoped `GET /uploads/:id{,/download}` is live; library downloads reuse `canAccessAttachment`)
- Phase 03 complete (auth lifecycle verified; smoke/e2e env uses `AUTH_RATE_LIMIT_MAX`)

---

## Schema (migration 0005, additive only)

Generate with `npm run db:generate`, review the SQL by hand, apply with `npm run db:migrate`. Never `db:push` / `db:reset` / TRUNCATE.

**`library_items`** (`backend/src/db/schema.ts`, add after `attachments` at ~line 238):

| Column | Type | Constraint |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `title` | text | not null |
| `category` | text | not null (free text) |
| `level` | text | null |
| `description` | text | null |
| `tags` | text[] | not null, default `'{}'` (use `.default(sql`'{}'::text[]`)` exactly like `lesson_plans.focus`) |
| `attachment_id` | uuid | not null, FK `attachments.id` `onDelete: restrict`, UNIQUE (one library item per file; also the lookup index for `canAccessAttachment`) |
| `created_by` | uuid | not null, FK `users.id` |
| `status` | text | not null, default `'published'`; values `published` \| `archived` (zod-enforced, matching how other status columns are done) |
| `created_at`, `updated_at` | timestamptz | not null, default now |

**`lesson_library_items`**:

| Column | Type | Constraint |
|---|---|---|
| `lesson_id` | uuid | not null, FK `lessons.id` `onDelete: cascade` |
| `library_item_id` | uuid | not null, FK `library_items.id` `onDelete: restrict` |
| `attached_by` | uuid | not null, FK `users.id` |
| `attached_at` | timestamptz | not null, default now |
| PK | | composite `(lesson_id, library_item_id)`; plain index on `library_item_id` |

Migration review checklist (A3): file is `0005_*.sql`; contains only `CREATE TABLE` / `CREATE INDEX` / FK `ALTER TABLE ... ADD CONSTRAINT`; no `DROP`/`ALTER COLUMN` on existing tables; `meta/_journal.json` + snapshot generated; `npm run db:migrate` is idempotent on a second run.

---

## Backend Design

### Routes (`backend/src/routes/library.ts`, new; mounted in `backend/src/routes/index.ts`)

Shape follows the repo convention (`export const libraryRoutes: FastifyPluginAsync`, zod at top, `AppError` helpers, `logActivity` inside the same transaction as the write).

| Method + path | Guard | Body / rules | Errors |
|---|---|---|---|
| `POST /library` | `requireRole(["admin","manager"])` | `{attachmentId, title, category, level?, description?, tags?}` (zod `.strict()` so unknown keys are 400; trimmed, title/category 1-200 chars, level max 50, description max 2000, tags max 20 x 50 chars). Attachment must exist; `attachment.uploadedBy === actor.sub` OR actor is admin; attachment must NOT be request evidence (`requests.attachmentId`); attachment must not already back a library item. Name/type/size are read from the attachments row, never from client metadata. Logs `library.created` | 404 attachment missing; 403 not uploader (non-admin); 422 `ATTACHMENT_NOT_ELIGIBLE` request evidence; 409 `CONFLICT` already used (pre-check AND map PG unique violation 23505) |
| `PATCH /library/:id` | `requireRole(["admin","manager"])` + creator-or-admin check in handler | partial `{title?, category?, level?, description?, tags?, status?}` (zod `.strict()` with the same limits, at least one key; `attachmentId` and `createdBy` are never patchable, D5 no file replace); `status` `archived`/`published` = archive/unarchive; bumps `updated_at`. Logs `library.updated`, or `library.archived` when status flips to archived (unarchive logs `library.updated`) | 404; 403 manager who is not creator |
| `POST /lessons/:id/library-items` | `requireRole(["admin","manager"])` | `{libraryItemId}`. Admin: any lesson. Manager: `managerOwnsTeacher(lesson.teacherId)` else 403. Item must be `published` (422 `ITEM_ARCHIVED`); lesson status must be `scheduled` or `live` (422 `LESSON_NOT_ATTACHABLE`). Idempotent: `onConflictDoNothing()` on the composite PK, returns 200 either way. Logs `lesson.libraryAttached` only when a row was actually inserted | 404 lesson/item; 403 |
| `DELETE /lessons/:id/library-items/:libraryItemId` | `requireRole(["admin","manager"])` | same ownership rule; allowed on ANY lesson status; idempotent 204 if link absent (no activity). Logs `lesson.libraryDetached` when a row was deleted | 403, 404 lesson |

Teacher/student calls to any of these return 403 from `requireRole`. The attach/detach routes live in `library.ts` (NOT `lessons.ts`), keeping `lessons.ts` untouched. Mount with `await app.register(libraryRoutes)` and NO prefix (the file owns both `/library` and `/lessons/:id/library-items`, full paths inside the file); add `app.hasRoute` assertions for the 4 routes (plus anonymous 401) to `backend/tests/contract.test.ts`.

### Attachment authorization (`backend/src/lib/scope.ts`, `canAccessAttachment`, lines 191-335)

Anchors verified 24-11-26: admin/uploader early-return at 196-198; request-evidence block 208-234; plan-link block starts 236, with `if (planRows.length === 0) return false` at 249-251 (this is the early return that would shadow a library branch).

Insert a new **library block between the request-evidence block (ends 234) and the plan block (starts 236)** that does NOT return false on no-match; it returns true on a pass and otherwise falls through to the existing plan logic (a file that is both a plan file and a library item keeps both paths). Logic:

1. Look up `library_items` where `attachment_id = attachment.id`. No row: fall through.
2. Admin / uploader already passed at 196. Creator (`created_by === actor.sub`): true.
3. **manager:** true if item `status = 'published'`, OR item linked (via `lesson_library_items`) to a lesson whose `teacherId` is in `managerTeam().teacherIds` (covers archived items still linked to team lessons). Otherwise fall through.
4. **teacher:** true only if item is linked to a lesson with `lessons.teacherId = actor.sub` AND `lessons.status != 'cancelled'`. No browse access.
5. **student:** true only if item is linked to a lesson with `lessons.studentId = actor.sub` AND `lessons.status != 'cancelled'`.
6. Archived items: no new browse; existing-link access unchanged (rules 3-5 do not look at item status except the manager "published" shortcut).

Must not reopen the Phase 02 hole: request evidence stays student-invisible (library rows cannot reference request evidence because POST rejects it, and the request block still runs first); unreferenced uploads by another user still return 403.

### Bootstrap (`backend/src/routes/school.ts`)

`BOOTSTRAP_COLLECTION_KEYS` (line ~25-42) gains `"libraryItems"` and `"lessonLibraryItems"` (16 -> 18). Role filters (computed from `visibleLessons`, school.ts:182-190):

| Role | `libraryItems` | `lessonLibraryItems` |
|---|---|---|
| admin | all | all |
| manager | all `published`; plus own (`created_by = actor`) archived; plus archived items linked to a team lesson | links for team lessons (`visibleLessons`) |
| teacher | items linked to own lessons with `status != 'cancelled'` only | links for those lessons only |
| student | items linked to own lessons with `status != 'cancelled'` only | links for those lessons only |

- `lessonLibraryItems` has no `id` column; each shipped record is `{id: "{lessonId}:{libraryItemId}", lessonId, libraryItemId, attachedBy, attachedAt}` so backend `toRecord` and the frontend generic repositories (`upsert`/`remove` read `entity.id`) work. The `id` is derived, never stored.
- Every visible item's `attachmentId` is added to the role's `attachmentIds` set (school.ts ~316-325) so `attachments` metadata (name/type/size) ships and downloads resolve.
- `referencedUserIds` (school.ts ~286-300): add `createdBy`/`attachedBy` for **admin and manager only**; teacher/student bootstraps must NOT pull manager/creator user rows because of the library, and teacher/student UI must not render a creator name.
- Seed/demo and cancelled-lesson behavior: a lesson that becomes `cancelled` drops out of teacher/student visibility automatically (rule is evaluated per bootstrap).

### Activity / labels

- `backend/src/lib/activity.ts` `ActivityAction` union (line 13): add `library.created`, `library.updated`, `library.archived`, `lesson.libraryAttached`, `lesson.libraryDetached`.
- `backend/src/routes/notifications.ts` has no label map (verified) and is NOT touched. The label map lives in `frontend/app/lib/school/notifications.ts` (~line 154, next to `lesson.planChanged`): add the 5 labels; `categoryOf`/`navFor` fall back to defaults, confirm in EXECUTE that unknown-family handling needs no change.

---

## Frontend Design

### Data layer

- `frontend/app/lib/school/types.ts`: add `LibraryItem {id,title,category,level?,description?,tags:string[],attachmentId,createdBy,status:"published"|"archived",createdAt,updatedAt}` and `LessonLibraryLink {id,lessonId,libraryItemId,attachedBy,attachedAt}` (`id` = `{lessonId}:{libraryItemId}`, derived; required because every `SchoolCollections` value is `Record<string, T>` and `repositories.ts` reads `entity.id`); add `libraryItems` and `lessonLibraryItems` to `SchoolCollections`. `SCHOOL_SCHEMA_VERSION` stays 3.
- `frontend/app/lib/school/store.ts` `createEmptySchool`, `frontend/app/lib/school/seed.ts` (both empty arrays), `upgrade()` fills the missing collections from the seed ONLY when `dataSource === "local"` (API cache starts empty; fence preserved).
- `frontend/app/lib/school/api/bootstrap.ts` `COLLECTION_KEYS` (line 25) += the 2 keys.
- `frontend/app/lib/school/api/library.ts` (new): `createLibraryItem`, `updateLibraryItem`, `attachLibraryItem`, `detachLibraryItem` calling the 4 routes (file bytes go through the existing `api/uploads.ts` `uploadFile`).
- `frontend/app/lib/school/permissions.ts`: add to `SchoolAction` (line 10-36) and the switch (line 75+): `library.manage` = admin || manager; `library.edit` = admin || creator (`target.libraryItemId`; extend `PermissionTarget`); `lesson.attachLibraryItem` = admin || manager where `managerIdForTeacher(data, lesson.teacherId) === actor.id` (teacher-team scope, mirrors backend `managerOwnsTeacher`; do NOT reuse `ownsAsManager`, which also requires the student's roster manager to match and would hide the button for lessons the backend allows). **No teacher/student grant.**
- `frontend/app/lib/school/services/library.ts` (new, exported from `services/index.ts`): `createLibraryItem(actorId, file, meta)`, `updateLibraryItem`, `setLibraryItemStatus`, `attachLibraryItem`, `detachLibraryItem`. Dual-branch on `isApiDataMode()`: API branch `runAsync` to `api/library.ts` then refresh like the existing API-branch services; local branch `updateSchool(draft => ...)` with `assertCan` + `recordActivity` (action strings identical to the backend). File upload reuses the validation (5 MB, PDF/image/Word/PowerPoint) and storage pattern of `services/uploads.ts` (`validate`, `saveLargeFile`/IndexedDB in demo, `uploadFile` in API). Attach in the local branch enforces the same rules (item published, lesson scheduled/live).
- `frontend/app/lib/school/selectors.ts`: `libraryItemsFor(data, filters)`, `libraryForLesson(data, lessonId)` as needed.
- `frontend/app/lib/school/views.ts`: the Lesson -> StudentLesson mapper gains `materials` (verify exact function name at EXECUTE; teacher view already has `material:` at line 83 via `lessonMaterialView`, extend or add `libraryMaterials` to the teacher view type). `frontend/app/lib/types.ts` `StudentLesson` (line 11) gains `materials?: {id,title,category,attachmentId,fileName,type,size,storageKey?}[]` (`storageKey` is needed so demo-mode `downloadAttachmentFile` can read IndexedDB; the teacher view's `libraryMaterials` uses the same shape); `frontend/app/components/student/useStudentWorkspace.ts` (the real path; NOT `lib/hooks`) passes it through. If `frontend/app/lib/data.ts` constructs `StudentLesson` literals the optional field needs no change there (Phase 05 owns that file; do not edit).

### UI (no new global CSS; reuse `lesson-material-*`, `lesson-detail-section`, modal classes; any unavoidable style is appended inline-scoped and noted for Phase 05)

- `frontend/app/components/manager/ManagerCurriculum.tsx`: add a "Courses / Library" toggle (admin reaches it via `ManagerWorkspace.tsx:56`). Library view in new `frontend/app/components/manager/ManagerLibrary.tsx`: list, search, category filter, "Show archived" toggle; upload + create, edit, archive/unarchive (edit/archive buttons gated by `library.edit`). Create/edit form + `LibraryPickerModal` live in new `frontend/app/components/manager/LibraryForms.tsx`.
- **Manager/admin attach surface:** managers attach plans today via `PlanPickerModal` (`CurriculumForms.tsx`) from `ManagerSchedule.tsx` (dialog kind `"plan"`, ~line 189, gated by `can(..., "lesson.attachPlan")` at line 119) and `ManagerStudents.tsx` (~line 211). Add a sibling dialog kind `"library"` and a "Materials" button beside the plan action in BOTH files, gated by `lesson.attachLibraryItem`; the lesson detail dialog (ManagerSchedule ~185-190) lists linked materials with a detach control. Picker lists published items only, hides already-attached ones.
- `frontend/app/components/teacher/TeacherLessons.tsx` material panel (~410-430): add a linked-materials list with download buttons (reuse `lesson-material-file` markup, same pattern as the plan files list at ~420-424); extend the empty-state copy at line 430 to "Your manager will attach the lesson plan and materials before class." The library list renders independently of the plan block (`selected.material ? ... : empty`), and the empty state shows only when there is neither a plan material nor library materials. No attach control.
- `frontend/app/components/student/StudentLessons.tsx`: render `lesson.materials` with download via `attachment-download.ts` (works for both API blob download and demo IndexedDB), hidden for cancelled lessons.
- Demo/API fence: demo branch never calls `/api/v1`; API mode never writes `lumina-school:v1`; reset stays inert in API mode.

---

## Blast Radius (corrected, verified 24-11-26)

**Modified/created (backend):** `backend/src/db/schema.ts`; `backend/src/db/migrations/0005_*.sql` + `meta/_journal.json` + `meta/0005_snapshot.json`; `backend/src/routes/library.ts` (new); `backend/src/routes/index.ts`; `backend/src/routes/school.ts`; `backend/src/lib/scope.ts`; `backend/src/lib/activity.ts`; `backend/tests/contract.test.ts`; `backend/scripts/smoke.ts` (path verified; **shared with Phase 05/06**).

**Modified/created (frontend):** `frontend/app/lib/school/{types,store,seed,permissions,selectors,views,notifications}.ts`; `frontend/app/lib/school/api/{bootstrap,library}.ts`; `frontend/app/lib/school/services/{library,index}.ts`; `frontend/app/lib/types.ts`; `frontend/app/components/student/useStudentWorkspace.ts`; `frontend/app/components/manager/{ManagerCurriculum,ManagerLibrary,LibraryForms,ManagerSchedule,ManagerStudents}.tsx`; `frontend/app/components/teacher/TeacherLessons.tsx`; `frontend/app/components/student/StudentLessons.tsx`; `frontend/e2e/api/curriculum-library.spec.ts` (new); `frontend/e2e/demo/regression.spec.ts`.

**NOT touched:** `backend/src/routes/{lessons,bookings,uploads,school-import,notifications}.ts`, version fixtures, `frontend/app/globals.css`, `frontend/app/lib/data.ts`, `frontend/playwright.config.ts`, `frontend/e2e/support/api.ts` (unless a shared helper is strictly required; if so append-only and flagged).

**Risk class:** schema/migration + authorization/trust boundary (high-risk per `vc-risk-evidence-pack`); shared-surface regression with Phase 02 (`scope.ts`, uploads) and Phase 03 (`smoke.ts`).

---

## Implementation Checklist

Per-step gates run at the end of each step (A-D: `typecheck`, `lint`, backend `vitest`); smoke/e2e run in Step E.

### Step A — Schema, Migration & Contract Keys

- [x] A1. Add `libraryItems` and `lessonLibraryItems` tables exactly as specified above to `backend/src/db/schema.ts` (+ exported row types if the file exports them).
- [x] A2. Run `npm run db:generate`; review `0005_*.sql` against the migration review checklist; run `npm run db:migrate` (twice, second is a no-op). Commit-ready journal + snapshot.
- [x] A3. Add `"libraryItems"`, `"lessonLibraryItems"` to `BOOTSTRAP_COLLECTION_KEYS` (school.ts) and to `SchoolCollections`/`createEmptySchool`/`COLLECTION_KEYS` stubs in the frontend (types.ts, store.ts, seed.ts, api/bootstrap.ts); update `backend/tests/contract.test.ts` `toHaveLength(16)` -> `18` (line 85). Gate: `typecheck` + backend vitest green (contract test is the sync proof).

### Step B — Backend routes, scope, bootstrap, activity

- [x] B1. Add the 5 action names to `ActivityAction` (activity.ts:13).
- [x] B2. Implement `routes/library.ts` (4 routes, rules and error codes per table) and mount in `routes/index.ts`; all writes + `logActivity` in one transaction.
- [x] B3. Insert the library block in `canAccessAttachment` (between scope.ts:234 and :236) per the rules; keep plan logic unchanged.
- [x] B4. Extend bootstrap in `school.ts`: role-filtered `libraryItems`/`lessonLibraryItems`, attachment-id additions, referenced-user rule. Gate: typecheck, lint, vitest.

### Step C — Frontend data layer & permissions

- [x] C1. Types/store/seed/`upgrade()` fence/`api/bootstrap.ts` already stubbed in A3; finish `views.ts` + `lib/types.ts` + `useStudentWorkspace.ts` (`materials`) and `notifications.ts` labels.
- [x] C2. `permissions.ts` (3 actions, no teacher grant), `selectors.ts`, `api/library.ts`, `services/library.ts` (+ `services/index.ts` export), dual-branch with matching activity strings. Gate: typecheck, lint.

### Step D — UI

- [x] D1. `ManagerLibrary.tsx` + `LibraryForms.tsx` + Courses/Library toggle in `ManagerCurriculum.tsx`.
- [x] D2. Manager/admin attach/detach: "library" dialog in `ManagerSchedule.tsx` and `ManagerStudents.tsx`, linked-materials list in the lesson detail dialog.
- [x] D3. `TeacherLessons.tsx` materials list + copy tweak; `StudentLessons.tsx` materials + download. Gate: typecheck, lint, `next build` not required (covered by e2e web server start).

### Step E — Tests (see matrix) & exit gates

- [x] E1. `backend/scripts/smoke.ts`: add `library` domain (`scenario("library", libraryScenario)` after `notifications` at ~line 1226) per the smoke matrix; extend `cleanup()` (smoke.ts:86) to ARCHIVE (never delete) the library items created by smoke fixture users: `UPDATE library_items SET status='archived'` where `created_by` is a user whose email matches `smoke-{runId}-%` (best-effort try/catch, same pattern as the existing user archive, before it). Smoke `cleanup()` only archives users and never deletes rows (fixtures stay in the dev DB by design), so the `restrict` FK causes no cleanup-order problem, but an un-archived published item would stay visible to every real manager in the dev library. Total: 16 domains, 463 existing checks + library checks (target >= 40; exact total recorded by EVL).
- [x] E2. `backend/tests/contract.test.ts`: key count 18 (done in A3) plus `app.hasRoute` assertions for the 4 library routes and anonymous 401 checks (the file already asserts route lists; verified at validate time).
- [x] E3. `frontend/e2e/api/curriculum-library.spec.ts` (new) per the e2e matrix.
- [x] E4. `frontend/e2e/demo/regression.spec.ts`: add library toggle visible + local create/attach + `apiCalls` stays `[]`; plus UI-level negatives for the local-branch rules: an archived item is absent from the Materials picker, no Materials action on a completed lesson, no attach control in the teacher view.
- [x] E5. Run all exit gates and Phase 02/03 regression (below).

---

## Step F — Review fixes (24-11-26)

Supplement mode, 24-11-26, after EXECUTE A-E and a green EVL pass (vitest 6 files/44 tests, smoke 16 domains/594 checks, e2e 27 API + 4 demo). User-approved review fixes, all inside Phase 04 and before the Phase 04 commit. Steps A-E and the existing validate-contract are NOT rewritten; Step F is additive and needs a supplement validate (see the dated note under `## Validate Contract`). `SCHOOL_SCHEMA_VERSION` stays 3. Never `db:reset` / `db:push` / TRUNCATE. Never edit migration `0005` (applied to dev `lumina`).

### Verified anchors (24-11-26)

- `backend/src/routes/courses.ts:81-87` `attachmentSchema` takes client `id,name,type,size,storageKey`; handler `:609-623` inserts `{...body, uploadedBy}` with `.onConflictDoNothing()` (`:618`). Role gate `admin|manager`; `assertPlanEditable` (`:90`) already enforces course ownership.
- `backend/src/routes/uploads.ts:90-93` `join(resolve(UPLOAD_DIR), attachment.storageKey)` with no containment check. Other `storageKey` writers: `POST /uploads` (`:41`, server-generated `randomUUID()` + `extname(filename)`, safe) and `backend/src/lib/school-import.ts:122` (admin-only import; client string, default `""`). `routes/school.ts:475` only reads it. An empty or `.` key resolves to the upload directory itself, so containment must also reject "equals the directory".
- Callers of the plan-attach contract: `frontend/app/lib/school/api/curriculum.ts:47-48` (`attachLessonPlanFile`) <- `services/curriculum.ts:262-268` (`attachFileToPlan`, API branch) <- `services/uploads.ts:36` (`uploadPlanFile`, passes the server attachment returned by `POST /uploads`); `backend/scripts/smoke.ts:891` and `:918`. e2e `uploads.spec.ts` drives the UI only (no direct call). `school-import.ts` does not use this route. `frontend/e2e/support/local-school.ts` matches only demo `storageKey` seeds (unaffected).
- `backend/src/routes/school.ts:342-351` adds other managers' full user rows via `libraryItems.createdBy` / `lessonLibraryItems.attachedBy` (manager role only). `attachedBy` is never displayed (only `services/library.ts:177` writes it, `types.ts:137` declares it). Creator name is displayed at `frontend/app/components/manager/ManagerLibrary.tsx:19`.
- `backend/src/routes/library.ts:315-326` attach race throws a plain `Error` (500); `:94` mapper silently coerces any non-`archived` status to `published`; `backend/src/db/schema.ts:262` `status` has no CHECK (`:243` comment says zod-enforced only).
- Observation to record (not fixed here): `backend/src/routes/requests.ts:39,148` stores `body.attachmentId` unvalidated (existing backlog `request-attachment-ownership_NOTE_24-11-26.md`, verified still true).

### F1 (HIGH) — Plan attach must reference an existing upload; downloads must stay inside UPLOAD_DIR

Decision (minimal contract change): `POST /courses/:id/units/:unitId/plans/:planId/attachments` body becomes `{ "attachmentId": "<uuid>" }`, `.strict()` (any other key, including `id`, `name`, `type`, `size`, `storageKey`, is 400 `VALIDATION_ERROR`). Rationale: matches `POST /library`; client file metadata is never trusted. Response (updated plan row) is unchanged. The old `{id,...}` shape is removed, not tolerated, because tolerating extra keys is exactly the exploit.

- F1.1 `backend/src/routes/courses.ts`: replace `attachmentSchema` with `z.object({ attachmentId: z.string().uuid() }).strict()`. Handler order: `assertPlanEditable` -> load plan (404) -> load `attachments` row by id (404 "Attachment not found") -> if `actor.role !== "admin" && attachment.uploadedBy !== actor.sub` 403 -> if a `requests` row has `attachmentId` equal to this id, 422 `ATTACHMENT_NOT_ELIGIBLE` "Request evidence cannot be attached to a lesson plan" (same rule and code as `POST /library`, library.ts:154-165) -> append the id to `plan.attachmentIds` if absent (idempotent) -> return updated plan. The handler NEVER inserts or updates an `attachments` row: remove the `.insert(attachments)` call at `:618` and the `body.id` usage at `:619`. Add `requests` to the schema import if absent.
- F1.2 `backend/src/lib/upload-path.ts` (new, pure): `export function resolveUploadPath(uploadDir: string, storageKey: string): string | null`. Resolves `path.resolve(uploadDir, storageKey)`; returns `null` when `path.relative(resolve(uploadDir), target)` is `""`, starts with `..`, or is absolute (covers `..` traversal, absolute keys incl. Windows drive paths, empty/`.` key, Windows case/separator variants; equivalent to "must be inside `resolve(UPLOAD_DIR)` + sep"). No filesystem access, no symlink resolution (documented limitation: UPLOAD_DIR is server-controlled).
- F1.3 `backend/src/routes/uploads.ts` download handler (`:90-93`): use `resolveUploadPath`; on `null` call `request.log.warn({ attachmentId: attachment.id }, "attachment storageKey escapes UPLOAD_DIR; refusing download")` (log the id only, not the key) and `throw notFound("Attachment file is missing from storage")` (404, same message as a missing file, no oracle). Keep the `access()` check and headers unchanged. `POST /uploads` (`:41-42`) stays as is (server-generated key; verified).
- F1.4 Frontend contract: `frontend/app/lib/school/api/curriculum.ts:47-48` `attachLessonPlanFile(courseId, unitId, planId, attachmentId: string)` posts `{ attachmentId }`; `frontend/app/lib/school/services/curriculum.ts:267` API branch passes `file.id`. `attachFileToPlan`'s signature and the local (demo) branch are unchanged (demo `storageKey` stays client-local; fence intact). `services/uploads.ts` needs no change.
- F1.5 Existing rows: dev data may already hold client-supplied `storageKey` values written by the old route. Containment covers them at read time; NO data mutation or cleanup in this phase. Backlog line for `lesson-plan-attach-hardening_NOTE_24-11-26.md`: audit existing `attachments.storage_key` values that do not match `{uuid}{ext}`; school-import `storageKey` is client-supplied by an admin.
- Do not touch `school-import.ts`; containment makes its client `storageKey` harmless for download.

### F2 (Medium) — No other-manager user rows from the library; ship a creator display name

- F2.1 `frontend/app/lib/school/types.ts:118` `LibraryItem`: add optional `createdByName?: string` (keep `createdBy: string`). Optional so teacher/student payloads and old caches stay valid; `SCHOOL_SCHEMA_VERSION` stays 3; no new bootstrap key (count stays 18; contract test needs no change).
- F2.2 `backend/src/routes/library.ts:84` `libraryItemRecord(row, creatorName?: string)`: emits `createdByName` only when provided. Create/PATCH handlers (staff only) look up `users.name` for `row.createdBy` and pass it.
- F2.3 `backend/src/routes/school.ts`: delete the manager-only block `:342-351` (both `createdBy` and `attachedBy` additions). In the `libraryItems` mapper (`:634`) build `nameById` from the already-loaded `userRows` and pass the name for `admin` and `manager` actors only; teacher/student get no `createdByName`. `createdBy` id stays on every item; `attachedBy` stays an id (never displayed).
- F2.4 `frontend/app/components/manager/ManagerLibrary.tsx:19`: `creator: item.createdByName ?? nameOf(data, item.createdBy, "Staff")`.
- F2.5 Demo/local branch `frontend/app/lib/school/services/library.ts:124`: set `createdByName: actor.name` (confirm the `SchoolUser` name field at EXECUTE; local users are always present).
- F2.6 Smoke (F5 iv): a manager bootstrap has NO user row of another manager solely because of a library item and carries `createdByName` equal to the creator's name.

### F3 (Low) — Attach race is 409, not 500

`backend/src/routes/library.ts:295-327`: inside the transaction, retry the `INSERT ... ON CONFLICT DO NOTHING` once when the follow-up select finds no row (a concurrent detach removed it between the two statements); if the second attempt also yields no inserted/existing row, throw `conflict("The library link changed while attaching; try again")` (409 `CONFLICT`). Decision: retry once, then 409; never a plain `Error`. The `lesson.libraryAttached` activity row is written only by the attempt that actually inserts.

### F4 (Low) — `library_items.status` CHECK via NEW migration 0006

- F4.1 Pre-check (read-only, before generating): `select count(*) from library_items where status not in ('published','archived')` against dev `lumina` must be `0` (smoke items are `published`/`archived`; zod already restricted writes). Non-zero: STOP and report BLOCKED; do not mutate data.
- F4.2 `backend/src/db/schema.ts`: add a table-level check on `libraryItems` (third-argument callback) named `library_items_status_check`, `status in ('published','archived')`; update the `:243` comment to "zod and CHECK-enforced". Confirm the drizzle-orm 0.38 / drizzle-kit 0.30 `check()` API with vc-docs-seeker at EXECUTE before writing.
- F4.3 `npm run db:generate` produces `0006_*.sql`, a journal entry and `0006_snapshot.json`. Review: the SQL must be a single additive `ALTER TABLE "library_items" ADD CONSTRAINT "library_items_status_check" CHECK (...)`; any DROP/recreate/type change is a BLOCKER. Never edit `0005_*` or hand-edit journal/snapshot. Then `npm run db:migrate` twice (second is a no-op).
- F4.4 `backend/src/routes/library.ts:94`: make the mapper strict via `libraryStatus(value: string)` returning `"published" | "archived"` or throwing (500 on corrupt data) instead of coercing to `published`.

### F5 (Low, tests) — vitest, smoke and e2e additions

- Backend vitest: new `backend/tests/upload-path.test.ts` (pure, Fully-Automated) for `resolveUploadPath`: `uuid.pdf` inside; `a/b.pdf` inside; `../.env` null; `a/../../.env` null; absolute POSIX path null; Windows `C:\Windows\win.ini` null; `""` and `"."` null (equals the directory); a sibling directory sharing the upload dir's name prefix null. Failing-first stub: each case written red before the helper exists. Expected backend vitest: >= 7 files and >= 52 tests (current 6/44).
- Smoke `uploads` domain (`backend/scripts/smoke.ts`): change the calls at `:891-893` and `:918-920` to send `{ attachmentId }` only, then add: (a) managerB attaching managerA's upload 403; (b) nonexistent attachment id 404; (c) `{ attachmentId, storageKey: "../.env" }` and the old `{ id, name, type, size, storageKey }` shape 400; (d) request-evidence upload 422; (e) admin attaches any upload 200; (f) no `attachments` row exists for the attempted client keys and the plan's `attachmentIds` holds only the legitimately attached id; (g) traversal fixture: insert a row directly via `db` (same pattern as `insertLibraryLesson`, smoke.ts:1212) with `storage_key = '../.env'` and name `smoke-traversal-{runId}`, then `download(admin)` returns 404 and the body does not contain `JWT_SECRET` (fixture stays by design like other smoke rows).
- Smoke `library` domain: (i) a file that is BOTH a plan attachment (published course plan) and a library item still reaches the plan block: enrolled student/teacher download 200, unrelated student 403, and archiving/detaching the library link does not remove plan access; (ii) `Promise.all` of two `POST /library` on one attachment gives exactly one 201 and one 409, never 500; (iii) `Promise.all` of parallel `POST /lessons/:id/library-items` for one item gives no 500 (both 200, exactly one `lesson.libraryAttached` row), and one attach racing one detach gives responses in {200, 204}, never 500; (iv) bootstrap hygiene (F2): uninvolved managerC's `users` has no managerA row while `libraryItems[itemA].createdByName` equals managerA's name; teacher/student items carry no `createdByName` and no extra user rows; (v) a direct DB insert of a `library_items` row with status `'bogus'` fails with a check violation (23514).
- e2e: `uploads.spec.ts` and `curriculum-library.spec.ts` should pass unchanged (UI path posts `{ attachmentId }` via the updated service); extend `curriculum-library.spec.ts` to assert the Library tab shows the creator display name; demo regression: library create shows the local creator name and `apiCalls` stays `[]`.
- Not changing: `school-import.ts`, `routes/{lessons,bookings,requests,notifications}.ts`, `scope.ts`, `globals.css`, `playwright.config.ts`.

### Step F acceptance criteria (REQ-TEST-LINK)

| ID | Criterion | proven by | strategy |
|---|---|---|---|
| AC-12 | Plan attach accepts only `{attachmentId}` (strict): 403 another user's upload, 404 unknown id, 400 extra/legacy keys incl. `storageKey`, 422 request evidence, admin any; the route never creates or changes an `attachments` row | smoke `uploads` checks F5 (a)-(f) | Hybrid |
| AC-13 | Download never serves a path outside `UPLOAD_DIR`; traversal/empty/absolute keys give 404 and a log line | vitest `upload-path.test.ts` + smoke traversal fixture F5 (g) | Fully-Automated (unit) + Hybrid (smoke) |
| AC-14 | Manager bootstrap adds no other-manager user row via the library; `createdByName` shipped and displayed for admin/manager, absent for teacher/student | smoke `library` F5 (iv) + e2e `curriculum-library.spec.ts` creator-name assertion | Hybrid |
| AC-15 | Concurrent create/attach/attach-vs-detach never return 500; duplicate create is one 201 + one 409; one activity row per real attach | smoke `library` F5 (ii), (iii) | Hybrid |
| AC-16 | Migration 0006 is one additive CHECK, applies twice cleanly, DB rejects an invalid status, mapper is strict | `npm run db:migrate` (twice) + SQL review + smoke F5 (v) | Hybrid |
| AC-17 | A file that is both a plan attachment and a library item keeps plan-block access for enrolled student/teacher and still blocks unrelated users | smoke `library` F5 (i) | Hybrid |
| AC-18 | No regression: Phase 02 uploads, Phase 03 auth, all A-E gates, demo fence | full Step F gate list below | Hybrid |

Known-Gap residual: none introduced. Backlog (UPDATE PROCESS writes stubs): audit of historical `attachments.storage_key` values (update `lesson-plan-attach-hardening_NOTE_24-11-26.md`; carry-out #3 above is resolved by F1 for the plan-attach route); school-import client `storageKey` provenance; symlink-safe resolution if UPLOAD_DIR ever holds untrusted links. Out of scope, kept as backlog: 390px chip clipping + Remove alignment (Phase 05 polish), library notification navigation (nit), duplicated upload validators (nit), manager unarchive of an admin-archived item (policy), bootstrap pagination, orphan uploads, `PATCH /lessons` `lessonPlanId` validation, `POST /requests` attachmentId ownership (verified unvalidated at `requests.ts:148`; existing note), demo library import, AV scanning.

### Step F checklist (execute in order; per-step gates: `typecheck`, `lint`, backend vitest)

- [x] F-1. Write `backend/tests/upload-path.test.ts` red-first, then `backend/src/lib/upload-path.ts` (F1.2). Gate: vitest green.
- [x] F-2. `uploads.ts` download containment (F1.3). Gate: typecheck, lint, vitest.
- [x] F-3. `courses.ts` strict `{attachmentId}` plan-attach (F1.1) plus frontend `api/curriculum.ts` and `services/curriculum.ts` (F1.4). Gate: typecheck (both workspaces), lint.
- [x] F-4. F4 pre-check, `schema.ts` CHECK, `npm run db:generate`, SQL review, `npm run db:migrate` x2, strict mapper (F4.1-F4.4). Gate: typecheck, vitest.
- [x] F-5. F2: `types.ts`, `library.ts` mapper + handlers, `school.ts` block removal and name map, `ManagerLibrary.tsx`, `services/library.ts` local branch. Gate: typecheck, lint, vitest (contract test still 18 keys).
- [x] F-6. F3 retry-once-then-409 in `library.ts`.
- [x] F-7. Smoke edits (`uploads` calls + new checks, `library` F5 (i)-(v)); e2e `curriculum-library.spec.ts` creator-name assertion and demo regression assertion.
- [x] F-8. Run the Step F gates below; EVL re-run by a spawned vc-tester. (Execute gates green 24-11-26; independent vc-tester EVL run is orchestrator-owned and still pending.)

### Step F gates

```powershell
npm run db:migrate          # twice; second is a no-op
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend
npm run smoke
npm run e2e
git diff --check
git diff --name-only -- backend/src/db   # expects 0005 files (journal modified) AND new 0006_*.sql + meta/0006_snapshot.json; 0005_*.sql content unchanged
# Expected counts (>= current): vitest >= 7 files / >= 52 tests; smoke >= 16 domains / >= 594 checks; e2e >= 27 API + 4 demo
```

### Step F blast radius additions

New: `backend/src/lib/upload-path.ts`, `backend/tests/upload-path.test.ts`, `backend/src/db/migrations/0006_*.sql`, `backend/src/db/migrations/meta/0006_snapshot.json`. Modified (beyond A-E): `backend/src/routes/{courses,uploads}.ts`, `backend/src/db/migrations/meta/_journal.json` (generated), `frontend/app/lib/school/api/curriculum.ts`, `frontend/app/lib/school/services/curriculum.ts`. Already in Phase 04 and touched again: `routes/{library,school}.ts`, `db/schema.ts`, `types.ts`, `ManagerLibrary.tsx`, `services/library.ts`, `backend/scripts/smoke.ts`, `frontend/e2e/api/curriculum-library.spec.ts`, `frontend/e2e/demo/regression.spec.ts`. Overlap: Phase 05 owns `lessons.ts`, `globals.css`, `data.ts`, the vitest runner (none touched); Phase 06 shares only `smoke.ts` (sequential order resolves). Phase 02 proving tests (smoke `uploads`, `uploads.spec.ts`) are exercised directly and MUST stay green. Risk class: authorization + file-system trust boundary + schema (minimum Hybrid; the pure containment helper also has a Fully-Automated unit gate).

### Step F rollback

Code: revert the Step F files (uncommitted before the Phase 04 commit). Migration 0006 is additive; if ever needed, drop the constraint via a new forward migration and never delete an applied migration file.

## Test Plan (vc-test-coverage-plan; chain loaded: all-tests.md + backend smoke / e2e / vitest docs)

### Acceptance criteria (REQ-TEST-LINK; every criterion names its proving gate and strategy)

| ID | Criterion | proven by | strategy |
|---|---|---|---|
| AC-1 | Migration 0005 applies cleanly and is additive | `npm run db:migrate` (twice) + SQL review | Hybrid (needs Postgres + backend env) |
| AC-2 | Bootstrap keys 18 in sync backend<->frontend | `npm run test --workspace @lumina/backend` (contract) | Fully-Automated |
| AC-3 | Admin/manager create item; uploader rule, request-evidence reject, duplicate 409; metadata from DB | smoke `library` create checks | Hybrid |
| AC-4 | Edit/archive = creator or admin only | smoke `library` patch checks | Hybrid |
| AC-5 | Attach/detach rules: manager own-team 200 / other-team 403; teacher 403; student 403; cancelled/completed lesson and archived item rejected; idempotent | smoke `library` attach checks | Hybrid |
| AC-6 | Download matrix correct and no Phase 02 regression | smoke `library` + `uploads` domains | Hybrid |
| AC-7 | Bootstrap per-role visibility, no cross-student link leak | smoke `library` bootstrap checks | Hybrid |
| AC-8 | UI flow: upload, attach, student sees + downloads byte-identical, unrelated student 403 | `frontend/e2e/api/curriculum-library.spec.ts` | Hybrid |
| AC-9 | Demo parity and fence: toggle, local create/attach, zero `/api/v1` calls | `frontend/e2e/demo/regression.spec.ts` | Hybrid |
| AC-10 | Static soundness | `typecheck`, `lint`, `git diff --check` | Fully-Automated |
| AC-11 | New screens visually/usably sound at desktop + mobile | agent-probe screenshots of ManagerLibrary, attach modal, teacher panel, student list | Agent-Probe |

### Smoke `library` domain matrix (`backend/scripts/smoke.ts`)

Fixtures reuse existing manager/manager2/teacher/student labels from `setup()` (smoke.ts:382) plus an unrelated student.
1. Create: manager uploads via `upload()` then `POST /library` 201; admin create from another user's attachment 201; manager create from another user's attachment 403; request-evidence attachment 422; second item on same attachment 409; student/teacher `POST /library` 403; name/type/size equal the attachments row even when client sends different values.
2. Patch: creator 200; other manager 403; admin 200; archive logs `library.archived` once; unarchive 200.
3. Attach: manager attaches to own-team scheduled lesson 200 and again (idempotent, single activity row); manager2 on that lesson 403; teacher 403; student 403; admin any lesson 200; completed and cancelled lesson 422; archived item 422; detach by manager 204, detach on completed lesson allowed, repeat detach 204 without new activity.
4. Download (`download()` helper): linked student 200 with matching bytes; unrelated student 403; student of a cancelled linked lesson 403; teacher of linked lesson 200; unrelated teacher 403; other manager 200 for published item; archived + unlinked item: other manager 403, linked student still 200.
5. Bootstrap per role: student sees only own links/items and attachments; unrelated student sees none; teacher sees only own non-cancelled; manager sees published + team links; no other-student `lessonLibraryItems` rows for any non-admin role; teacher/student bootstrap contains no extra user rows caused by library.
6. Activity: exactly one row per mutation for `library.created|updated|archived`, `lesson.libraryAttached|libraryDetached`.
7. Validation and denial: PATCH with `attachmentId`, `createdBy`, or an unknown key 400 and an empty body 400; description > 2000 chars, level > 50, or > 20 tags 400; detach by teacher, student, and other-team manager 403; attach and detach with unknown lesson or unknown item 404; attach to a `live` lesson 200; Phase 02 regression: a request-evidence file stays 403 for the student while library items exist, and an unreferenced upload by another user stays 403.

Failing-stub rule (TDD, red-first at EXECUTE): each Fully-Automated/Hybrid scenario above is written as a failing check first; the contract-test count change (16 -> 18) is the red-first Fully-Automated stub.

### E2E matrix

- `frontend/e2e/api/curriculum-library.spec.ts`: manager (or admin) uploads a PDF and creates an item in the Library tab; attaches it to a student's lesson via the Materials dialog; student signs in, sees the material in StudentLessons and downloads it byte-identical; a second unrelated student cannot fetch it (403 on the download request); teacher of that lesson sees and downloads it in the material panel and has no attach control. Hygiene: unique `runId` markers; restore any spent credit with `setCreditBalance` in `finally` and cancel lessons it created (see `tests/all-tests.md` known gaps); archive the library item it created via PATCH; use `createDisposableUser` / `archiveUser` for the unrelated student.
- Demo regression: Library toggle visible for the manager, create + attach works locally, student view shows it, `apiCalls` equals `[]`.

### Regression

Phase 02: `npm run smoke` `uploads` + `credits` domains and `frontend/e2e/api/uploads.spec.ts`. Phase 03: `frontend/e2e/api/auth.spec.ts` and smoke `auth` domain. Existing 15 smoke domains and 26 API + 3 demo e2e tests stay green.

### Known gaps / residuals (Known-Gap is never a proving strategy; stubs go to backlog at UPDATE PROCESS)

| Gap | Resolution | Gate state |
|---|---|---|
| Frontend unit/component tests for `services/library.ts` | Phase 05 Vitest; backlog stub | Behavior is proven by e2e (AC-8, AC-9) so gate stays PASS-able |
| Demo-mode library data is not carried by the one-time import (`school-import.ts` unchanged) | Backlog stub: extend import in a later program | Accepted limitation, no developed behavior unproven |
| Visual pass of new screens + P3-13 carry-in (visual check pending from Phase 03) | Agent-Probe AC-11 | Must run in EVL or stays CONDITIONAL |

### Out-of-scope carry-outs (for UPDATE PROCESS to convert to backlog notes)

1. `PATCH /lessons/:id` lets a teacher set `lessonPlanId` without plan/status validation.
2. Orphaned uploads and detached plan files are never cleaned up (storage growth).
3. The lesson-plan attach route trusts client-supplied attachment metadata.

---

## Exit Gate

```powershell
npm run db:migrate
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend
npm run smoke
npm run e2e
git diff --check
# Expected: all exit 0; smoke = 16 domains (463 + library checks), e2e = 26 + curriculum-library spec API tests + 3 demo; contract test = 18 keys
```

- All checklist items checked; migration `0005` applied to dev `lumina` with no data loss (no `db:reset`)
- Phase 02 upload scoping and Phase 03 auth regression confirmed green
- Phase report written to the report destination above

---

## Blockers That Would Justify BLOCKED Status

- Phase 02 or Phase 03 exit gate not passed
- Migration SQL contains anything destructive or touches existing tables beyond FK/index additions
- `canAccessAttachment` change cannot keep Phase 02 smoke `uploads` green
- Backend/frontend contract mismatch cannot be reconciled without a version bump (would require import re-research)

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC runs once in the outer program loop).

- [x] 1. RESEARCH — 24-11-26: research-agent inspected ManagerCurriculum/Schedule/Students, TeacherLessons, StudentLessons, school.ts, scope.ts, uploads, schema; found manager attach lives in PlanPickerModal surfaces
- [x] 2. INNOVATE — 24-11-26: innovate-agent chose `library_items` + `lesson_library_items`; user overrode teacher-attach (managers/admin attach only), one global library, archive-only; Decision Summary written
- [x] 3. PLAN-SUPPLEMENT — 24-11-26: plan-agent wrote schema, routes, scope rules, bootstrap, frontend design, tests, corrected blast radius (see Inner Loop Refresh Note)
- [x] 4. PVL — 24-11-26: vc-validate-agent ran V1-V7; validate-contract written (`generated-by: inner-pvl: phase-04`), Gate: PASS, 9 concerns fixed in plan text/execute instructions, 5 known-gaps backlogged
- [x] 5. EXECUTE — 24-11-26: Steps A–E implemented; migration 0005_zippy_thunderbolt_ross applied; exit gates green (vitest 6/44, smoke 16 domains/594 checks, e2e 27 API + 4 demo, typecheck/lint/diff-check); high-risk pack written except review-decision.json (pending reviewer); AC-11 pending (no browser tool)
- [x] 5b. EXECUTE Step F (review fixes F1-F5, 24-11-26) — supplement validate required first; then Step F gates + EVL re-run (execute gates green 24-11-26: vitest 7/61, smoke 16/656, e2e 27+4; migration 0006_large_the_hand)
- [x] 6. EVL — 24-11-26: two independent vc-tester confirmation runs; #2 after Step F all green (db:migrate no-op, typecheck, lint, vitest 7/61, smoke 16 domains/656 checks incl. Phase 02 uploads + Phase 03 auth, e2e 27 API + 4 demo, 0005 hash unchanged); AC-11 demo-mode visual probe done, API-mode probe pending
- [x] 7. UPDATE PROCESS — 24-11-26: report written, database/auth/uxui/tests/root context updated, 9 backlog notes written, umbrella state rewritten, risk pack review-decision recorded (approved-with-concerns); execution commit 74639cb; process commit follows

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

---

## Touchpoints

- `backend/src/db/{schema.ts,migrations/0005_*.sql,migrations/meta/*}`
- `backend/src/routes/{library,index,school}.ts`, `backend/src/lib/{scope,activity}.ts`
- `backend/tests/contract.test.ts`, `backend/scripts/smoke.ts`
- `frontend/app/lib/school/{types,store,seed,permissions,selectors,views,notifications,api/bootstrap,api/library,services/library,services/index}.ts`, `frontend/app/lib/types.ts`
- `frontend/app/components/manager/{ManagerCurriculum,ManagerLibrary,LibraryForms,ManagerSchedule,ManagerStudents}.tsx`, `frontend/app/components/teacher/TeacherLessons.tsx`, `frontend/app/components/student/{StudentLessons.tsx,useStudentWorkspace.ts}`
- `frontend/e2e/api/curriculum-library.spec.ts`, `frontend/e2e/demo/regression.spec.ts`

---

## Public Contracts

- New endpoints: `POST /api/v1/library`, `PATCH /api/v1/library/:id`, `POST /api/v1/lessons/:id/library-items`, `DELETE /api/v1/lessons/:id/library-items/:libraryItemId` (error codes in the route table).
- `GET /api/v1/school/bootstrap` gains `libraryItems` and `lessonLibraryItems` (16 -> 18 keys), synced with `frontend/app/lib/school/types.ts` and `backend/tests/contract.test.ts`; `SCHOOL_SCHEMA_VERSION` stays 3.
- `GET /uploads/:id{,/download}` authorization widens only for library-linked files, per the scope rules; request evidence and unreferenced uploads unchanged.
- Existing lesson-plan attachments, course curriculum routes, `lessons.ts` and `bookings.ts` behavior unchanged; new activity actions (5).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `npm run db:migrate` (twice) + SQL review | Hybrid | AC-1 |
| `npm run test --workspace @lumina/backend` (contract, 18 keys) | Fully-Automated | AC-2 |
| `npm run smoke` `library` domain create/patch/attach/download/bootstrap/activity | Hybrid | AC-3, AC-4, AC-5, AC-6, AC-7 |
| `npm run smoke` `uploads` + `auth` domains (regression) | Hybrid | AC-6 |
| `frontend/e2e/api/curriculum-library.spec.ts` | Hybrid | AC-8 |
| `frontend/e2e/demo/regression.spec.ts` | Hybrid | AC-9 |
| `npm run typecheck`, `npm run lint`, `git diff --check` | Fully-Automated | AC-10 |
| Screenshot review of new screens (desktop + 390px) | Agent-Probe | AC-11 |
| Step F: smoke `uploads` plan-attach negatives + traversal fixture; vitest `upload-path.test.ts` | Hybrid + Fully-Automated | AC-12, AC-13 |
| Step F: smoke `library` bootstrap hygiene, races, plan+library coexistence; e2e creator name | Hybrid | AC-14, AC-15, AC-17 |
| Step F: `npm run db:migrate` x2 + 0006 SQL review + bogus-status insert rejected | Hybrid | AC-16 |
| Step F: full gate list (typecheck, lint, vitest, smoke, e2e, diff checks) | Hybrid | AC-18 |

High-risk classes present (schema/migration, authorization): minimum Hybrid; no Known-Gap accepted for any of them.

---

## Test Infra Improvement Notes

- Frontend has no unit-test runner until Phase 05; `services/library.ts` logic is only e2e-covered (backlog: add Vitest cases in Phase 05).
- `backend/scripts/smoke.ts` is a shared surface for Phases 04/05/06; keep the `library` domain self-contained (own fixtures, own cleanup) to minimize merge friction.

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-04-curriculum-library_PLAN_23-11-26.md`
- Last completed step: Step 4 PVL (24-11-26)
- Validate-contract status: written 24-11-26 (inner-pvl: phase-04, Gate: PASS)
- Supporting context files loaded: umbrella plan, phase-blast-radius-registry.md, process/context/{all-context,database,uxui,auth,tests} routers; code anchors verified (scope.ts:191-335, school.ts:25-42/182-325, activity.ts:13, permissions.ts:10-90, TeacherLessons.tsx:410-430, ManagerSchedule.tsx:119/189, smoke.ts:86/382/1225)
- Next step: spawn vc-execute-agent (opus, sequential) for Steps A-E in order with the per-step gates and execute instructions E1-E16 from the validate-contract; then EVL via a spawned vc-tester.

---

## Inner Loop Refresh Note: 2026-11-24 — changed sections: Purpose, Locked Decisions, Schema, Backend Design, Frontend Design, Blast Radius, Implementation Checklist, Test Plan, Exit Gate, Phase Loop Progress, Touchpoints, Public Contracts, Verification Evidence, Test Infra Improvement Notes, Resume and Execution Handoff. Invalidates prior validate-contract.

---

## Validate Contract

Status: PASS
Date: 24-11-26
date: 2026-11-24
generated-by: inner-pvl: phase-04

Parallel strategy: sequential
Rationale: 4/7 signals (S2 schema/API/auth surface, S4 phase program, S6 high-risk: schema migration + authorization trust boundary + public API, S7 5+ files; S1 not met: 2 workspaces, S3/S5 not met since decisions are locked). The score reads HIGH, but fit overrides it: the edit chain is dependent (schema, then routes and scope, then bootstrap, then frontend types, then services, then UI), and every hybrid gate shares one database and fixed ports (3000/3100/4000/4100), so parallel editing saves little and risks drift. One opus `vc-execute-agent`, backend first, then frontend. (The orchestrator's pre-score was 3/7; this contract counts S6 and S7 as both present, giving 4/7. Same recommendation either way.)
V2 note: the Layer 1 (4 dimensions) and Layer 2 (Sections: Schema, Routes, Attachment authorization, Bootstrap, Frontend data layer, UI, Tests) checks were executed in-session and sequentially by the validate agent, because a fire-and-forget subagent cannot spawn more agents. Evidence was read from source: `scope.ts` (lines 1-340), `schema.ts` (190-300), `uploads.ts`, `school.ts` (1-420), `activity.ts`, `routes/index.ts`, `users.ts` (delete = archive), `reset.ts`, `contract.test.ts`, `smoke.ts` (cleanup, setup, helpers, scenario list), `store.ts` (`upgrade`), `api/bootstrap.ts` (`parseSchoolData`), `repositories.ts`, `permissions.ts`, `views.ts`, `attachment-download.ts`, `notifications.ts`, `TeacherLessons.tsx`, `ManagerSchedule.tsx`, `ManagerStudents.tsx`, `e2e/support/*`, `import/plan.ts`, `school-import.ts`, drizzle config and journal, `tests/all-tests.md`.
V4 menu choices recorded (no interactive pause; recommended option taken for each): net gate PASS; strategy sequential (1 opus executor); cost guard not triggered; test gates as tabled below; V5 = "Accept" (no /goal print: BRANCH B, the umbrella `## Stable Program Goal` governs, so no goal block is written to this phase plan).

### Strategy options for EXECUTE (7-signal score 4/7)

| Strategy | Agent count | Model | Cost guard | Fit |
|---|---|---|---|---|
| Sequential (recommended) | 1 executor | opus | none | Dependent chain, shared DB and ports for gates |
| Parallel subagents | 2 editors (backend, frontend) + 1 tester = 3 | 2 opus + 1 sonnet | none | Frontend consumes backend keys and the link `id` shape; gates still serialize; low payoff |
| Workflow | 5 steps (A-E) x 1 agent x 1 pass = 5 (+ fix iterations) | opus for code steps | none | Overkill, item count is known |
| Agent team | 3 members (backend opus, frontend opus, security reviewer sonnet) x 2 rounds = 6 | mixed | none (3 <= 6 members) | Only if the user wants live security review of the `scope.ts` change during edits; named teammates with TeamCreate + shared task list + SendMessage, not bare parallel subagents |

Phase end: EVL must be a spawned `vc-tester` (sonnet) re-running the gate commands below; never run by the orchestrator in its own shell. The high-risk review decision is a spawned `vc-code-reviewer` (sonnet).

### Plan updates applied (24-11-26)

- [x] P1: Link collection needs an `id`. Every `SchoolCollections` value is `Record<string, T>`, `repositories.upsert/remove` read `entity.id`, and backend `toRecord<T extends {id}>` needs it; a link type without `id` fails typecheck. `LessonLibraryLink` now carries `id = "{lessonId}:{libraryItemId}"` (derived; no DB column); bootstrap ships it; local branch uses it for upsert/remove.
- [x] P2: Smoke `cleanup()` premise corrected. Smoke never deletes rows (it archives its users; fixtures stay in the dev DB), so the `restrict` FK has no cleanup-order problem. The real risk is smoke-created items staying PUBLISHED in the shared dev library, visible to every real manager. E1 now archives items created by smoke fixture users (best-effort, same pattern as the user archive) instead of deleting.
- [x] P3: `lesson.attachLibraryItem` must be teacher-scoped (`managerIdForTeacher(lesson.teacherId) === actor.id`), not `ownsAsManager`: the latter also requires the student's roster manager to match and would hide the button for lessons the backend (`managerOwnsTeacher`) allows. Locked decision D2 is teacher-team scope.
- [x] P4: `materials` (student) and `libraryMaterials` (teacher) entries now carry `storageKey?`; demo-mode download goes through `downloadAttachmentFile({id, name, storageKey})` which reads IndexedDB by `storageKey`, so without it demo downloads silently return false.
- [x] P5: Input limits and strictness: `level` max 50, `description` max 2000, both routes `.strict()`; PATCH can never change `attachmentId` or `createdBy` (D5 no file replace) and rejects an empty body.
- [x] P6: Smoke matrix gained item 7 (validation and denial cases: strict PATCH, limits, detach denials by teacher/student/other-team manager, 404s, attach to a `live` lesson, Phase 02 request-evidence regression after a library item exists).
- [x] P7: E2E hygiene specified: the API spec archives the library items it creates (PATCH) and cancels/restores like `booking.spec.ts` (`setCreditBalance` in `finally`), uses `createDisposableUser`/`archiveUser` for the unrelated student; demo spec gained negative assertions (archived item absent from the picker, no Materials action on a completed lesson, no attach control for the teacher).
- [x] P8: `TeacherLessons.tsx` empty state is shown only when there is neither a plan material nor library materials (the plan block is `selected.material ? ... : empty`; library list must render independently of it).
- [x] P9: Schema note: `tags` default uses `.default(sql\`'{}'::text[]\`)` exactly like `lesson_plans.focus`. Route mounting note: `app.register(libraryRoutes)` WITHOUT a prefix (it owns both `/library` and `/lessons/:id/library-items`), and the contract test gains `hasRoute` assertions for the 4 routes.
- [x] P10: Stale status text updated (header status, Phase Loop Progress step 4 ticked, Resume handoff).

### Execute-agent instructions

- E1 Order and gates: A1 → A2 → A3 → backend `typecheck`/`lint`/vitest; B1 → B4 → same gates; run `npm run smoke` ONCE after Step B (15 domains, no library domain yet) as a tripwire that the `canAccessAttachment` change did not regress Phase 02 (`uploads`); C → D with `typecheck` + `lint`; E last. Gates run one at a time, never in parallel (shared DB and ports).
- E2 Migration safety: confirm `backend/.env` `DATABASE_URL` is the local `lumina` database (smoke already refuses non-local hosts; do the same check by eye before `db:migrate`). Run `npm run db:generate`; if drizzle-kit shows ANY interactive rename/column prompt, STOP and report NEEDS_CONTEXT (new tables must not prompt). Hand-review `0005_*.sql` against the A3 checklist (only `CREATE TABLE`, `CREATE INDEX`, FK `ALTER TABLE ... ADD CONSTRAINT`; no `DROP`, no `ALTER COLUMN`, no touch of existing tables). `git diff --name-only -- backend/src/db` must list only `schema.ts`, `migrations/0005_*.sql`, `migrations/meta/_journal.json`, `migrations/meta/0005_snapshot.json`. Run `npm run db:migrate` twice; the second is a no-op. Never `db:push`, `db:reset`, or TRUNCATE. `backend/src/db/reset.ts` stays untouched: its `TRUNCATE ... CASCADE` reaches the new tables through their foreign keys, and it is never a gate.
- E3 Link id: `lessonLibraryItems` records carry `id: "{lessonId}:{libraryItemId}"` in the bootstrap (`toRecord` input), in `types.ts` (`LessonLibraryLink.id`), and in the local branch (`upsert`/`remove`). There is no `id` column in `lesson_library_items`.
- E4 Mounting and contract test: in `routes/index.ts` use `await app.register(libraryRoutes)` with NO prefix and full paths inside `library.ts` (`/library`, `/library/:id`, `/lessons/:id/library-items`, `/lessons/:id/library-items/:libraryItemId`); no path clashes with `lessonRoutes` (different suffixes). In `backend/tests/contract.test.ts` set `toHaveLength(18)` and add `app.hasRoute` assertions for the 4 routes plus anonymous 401 checks (the file already asserts route lists). Do this red-first (the length change is the failing stub).
- E5 `library.ts` rules: zod `.strict()` on both bodies with limits (title/category 1-200, level max 50, description max 2000, tags max 20 x 50, all trimmed); `POST` reads name/type/size from the `attachments` row only; check order: attachment exists (404), uploader-or-admin (403), not request evidence (422 `ATTACHMENT_NOT_ELIGIBLE`), not already a library item (409, plus map PG `23505` for the race); set `created_by` to the actor. `PATCH`: creator-or-admin in the handler, empty body 400, `archived` logs `library.archived`, unarchive logs `library.updated`. Attach: `onConflictDoNothing().returning()` and log `lesson.libraryAttached` only when a row came back; detach: `.returning()` and log `lesson.libraryDetached` only when a row was deleted; manager ownership via `managerOwnsTeacher(db, actor.sub, lesson.teacherId)`; attach requires lesson `scheduled` or `live` and item `published`; detach has no status gate. Every write plus `logActivity` in one transaction.
- E6 `scope.ts` (highest-risk edit): insert the library block between the request-evidence block and the plan block; the block returns `true` on a pass and otherwise FALLS THROUGH. It must never `return false` (that would shadow the plan block: a file can be both a plan file and a library item). Leave the admin/uploader early return, the request-evidence block, and the whole plan block byte-for-byte unchanged. Teacher and student rules require `lessons.status <> 'cancelled'` and the link join; students never see a request-evidence file because the request block still runs first and is skipped for students.
- E7 Bootstrap: derive library visibility from `visibleLessons` and the role table in the plan; add each visible item's `attachmentId` to `attachmentIds`; add `createdBy`/`attachedBy` to `referencedUserIds` for admin and manager only. Teacher/student payloads still carry the raw `createdBy`/`attachedBy` UUIDs (accepted: they are not names and no user rows are added); the UI must not render a creator name for those roles.
- E8 Frontend permissions: `library.manage` = admin or manager; `library.edit` = admin, or manager with `item.createdBy === actor.id` (add `libraryItemId?` to `PermissionTarget`, resolve via `get(data, "libraryItems", id)`); `lesson.attachLibraryItem` = admin, or manager where `managerIdForTeacher(data, lesson.teacherId) === actor.id`. Do NOT route it through `ownsAsManager`. Nothing is granted to teacher or student. Keep the `switch` exhaustive (the `never` default).
- E9 Frontend views and UI: `materials` and `libraryMaterials` include `storageKey`; student list hides materials for `cancelled` lessons; teacher library list renders independently of the plan block and the empty state appears only when both are absent. Before writing Next/React code read the relevant guide under `frontend/node_modules/next/dist/docs/` as `frontend/AGENTS.md` instructs. No edits to `globals.css`, `lib/data.ts`, or `playwright.config.ts`; any unavoidable style is inline-scoped and listed in the phase report for Phase 05.
- E10 Local (demo) branch: mirrors the backend rules (item published, lesson scheduled/live, no teacher/student grant) with identical `recordActivity` action strings; the demo library seed is empty; `upgrade()` already fills missing collections with empties via `createEmptySchool()`, so add no seed backfill and keep the API-cache fence (`dataSource === "local"` only). Known and accepted: an older API cache (version 3, no library keys) fails `parseSchoolData`, so the offline cache is ignored until the next successful bootstrap (the online path overwrites it).
- E11 Smoke: self-contained `library` domain appended with its own fixtures (managerA/managerB/teacherA/teacherB/studentA/studentB/studentZero from `setup()`); cleanup ARCHIVES (never deletes) library items created by smoke fixture users, best-effort in `cleanup()` before the user archive; no edits to existing domains; record the new check total.
- E12 E2E hygiene: unique `runId` markers; the API spec books or schedules through existing helpers, so it MUST restore the credit balance with `setCreditBalance` in `finally` and cancel any lesson it created (see `tests/all-tests.md` known gaps), archive the library item it created (PATCH `status: archived`), and archive any disposable user with `archiveUser`. Confirm ports 3000, 3100, 4000, 4100 are free before smoke/e2e (a stale backend on :4000 is reused by Playwright).
- E13 High-risk pack: produce the 5 artifacts in `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/harness/phase-04-library/`, run `node .claude/skills/vc-risk-evidence-pack/scripts/validate-risk-artifacts.mjs process/features/launch-readiness/active/lumina-v1-finish_23-11-26/harness/phase-04-library`, and record the reviewer decision before the phase is called ready.
- E14 Phase 02/03 regression: full `npm run smoke` (uploads, credits, auth domains) and `npm run e2e` (uploads, auth, booking, cancellation-refund, credit-concurrency specs) must stay green; do not edit Phase 02/03 surfaces beyond the planned append-only smoke/e2e additions.
- E15 Closeout counts for UPDATE PROCESS (do not edit docs during EXECUTE): backend vitest file/test counts, smoke domain count (15 → 16) and check total, e2e API/demo counts, `process/context/{all-context,tests/all-tests,database/*,uxui/*,auth/roles-and-scope}.md`, `process/features/curriculum/` docs, umbrella `## Current Execution State`.
- E16 Commit rules: execution commit separate from the process/context commit, both on `developing`; commit only on explicit user request.

### Test gates (run after each section; regression suite after all sections)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | Migration 0005 is additive, applies cleanly, second run is a no-op | Hybrid | `npm run db:migrate` (twice) + SQL review + `git diff --name-only -- backend/src/db` — precondition: local Postgres + `backend/.env` | B |
| AC-2 | Bootstrap keys 18 in sync backend↔frontend (incl. link `id` typing); 4 library routes registered and 401 anonymous | Fully-Automated | `npm run test --workspace @lumina/backend` (`contract.test.ts`) | B |
| AC-3 | Create: uploader-or-admin, request-evidence 422, duplicate 409, metadata from DB, student/teacher 403, limits 400 | Hybrid | `npm run smoke` (`library` domain, create checks) — precondition: local Postgres, port 4100 free | B |
| AC-4 | Edit/archive: creator or admin only; strict PATCH rejects `attachmentId`/`createdBy`/unknown keys; one `library.archived` row | Hybrid | `npm run smoke` (`library`, patch checks) | B |
| AC-5 | Attach/detach: own-team manager 200, other-team 403, teacher/student 403, cancelled/completed lesson and archived item 422, idempotent, detach any status, one activity row per mutation | Hybrid | `npm run smoke` (`library`, attach checks) | B |
| AC-6 | Download matrix (linked student/teacher 200 with matching bytes; unrelated, cancelled-lesson student 403; archived+unlinked item) and no Phase 02 regression | Hybrid | `npm run smoke` (`library` + `uploads` domains) | B |
| AC-7 | Bootstrap per role: no cross-student link leak, teacher/student pull no extra user rows, manager archived rules | Hybrid | `npm run smoke` (`library`, bootstrap checks) | B |
| AC-8 | UI flow: manager uploads + creates item, attaches via Materials, student sees and downloads byte-identical, unrelated student gets 403, teacher sees and downloads with no attach control | Hybrid | `npm run e2e` (`frontend/e2e/api/curriculum-library.spec.ts`) — precondition: seeded DB, ports 3000/3100/4000 free | B |
| AC-9 | Demo parity and fence: toggle, local create/attach, student view, archived item absent from picker, no Materials on completed lesson, no teacher attach control, `apiCalls` equals `[]` | Hybrid | `npm run e2e` (`frontend/e2e/demo/regression.spec.ts`) | B |
| AC-10 | Static soundness; only additive DB files changed | Fully-Automated | `npm run typecheck`; `npm run lint`; `git diff --check`; `git diff --name-only -- backend/src/db` lists only `schema.ts`, `0005_*.sql`, `meta/_journal.json`, `meta/0005_snapshot.json` | A |
| AC-11 | New screens visually and usably sound at desktop and 390px (ManagerLibrary, attach modal, teacher panel, student list) | Agent-Probe | `vc-agent-browser` against the e2e stack (API mode) or `npm run dev`: open each screen per role, capture screenshots, judge layout and copy | D |
| P4-R | Phase 02/03 regression holds with the widened `canAccessAttachment` | Hybrid | `npm run smoke` (`uploads`, `credits`, `auth`) + `npm run e2e` (`uploads`, `auth`, `booking`, `cancellation-refund`, `credit-concurrency`) | A |

Failing stubs (Fully-Automated rows; red-first starting points, not on-disk files):

```
// AC-2
test("should expose 18 bootstrap collection keys and register the 4 library routes", () => { throw new Error("NOT IMPLEMENTED — TDD stub: contract 18 keys + library routes + anonymous 401") })
// AC-10 is command-only (no stub)
```

Legacy line form (retained for existing consumers):
- Contract keys and routes: [Fully-automated: `npm run test --workspace @lumina/backend`]
- Static: [Fully-automated: `npm run typecheck`] | [Fully-automated: `npm run lint`] | [Fully-automated: `git diff --check`] | [Fully-automated: `git diff --name-only -- backend/src/db` lists only the 4 expected files]
- Migration: [hybrid: `npm run db:migrate` twice + local Postgres + backend env file]
- Library API and authorization: [hybrid: `npm run smoke` + local Postgres + backend env file, port 4100 free]
- Library UI: [hybrid: `npm run e2e` + seeded Postgres + ports 3000/3100/4000 free]
- Demo fence: [hybrid: `npm run e2e` (demo regression spec)]
- Screens: [agent-probe: desktop + 390px review via `vc-agent-browser`]
- Frontend service unit tests, demo-library import: [known-gap: documented as NEW PLAN REQUIRED — see Known gaps on record]

Never a gate: `npm run db:reset`, `db:push`, TRUNCATE (destructive).

**Regression suite (after all sections complete):** `npm run db:migrate`, `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend`, `npm run smoke`, `npm run e2e`, `git diff --check`, `git diff --name-only -- backend/src/db`. Plan-structure checks for the plan file after closeout edits: `node .claude/skills/vc-generate-phase-program/scripts/validate-phase-stub.mjs <this plan>` (0 failures before and after this contract).

### Dimension findings

- Infra fit: PASS — every referenced path exists except the intended new files (`routes/library.ts`, `services/library.ts`, `api/library.ts`, `ManagerLibrary.tsx`, `LibraryForms.tsx`, `curriculum-library.spec.ts`, migration `0005`); all anchors verified (`scope.ts` 196-198 / 208-234 / 236 / 249-251, `school.ts` `BOOTSTRAP_COLLECTION_KEYS`, `activity.ts` union, `TeacherLessons.tsx` material block, `ManagerSchedule.tsx` dialog kind "plan", `smoke.ts` scenario list); drizzle journal ends at idx 4 with a 0004 snapshot, so `db:generate` diffs correctly; `db:reset` TRUNCATE CASCADE reaches the new tables without editing `reset.ts`; ports 3000/3100/4000/4100 are expected free.
- Test coverage: PASS — after fixes: every developed behavior has a Fully-Automated or Hybrid gate; the smoke matrix now includes strictness, limits, and denial cases; the e2e hygiene (credit restore, archive of created items, disposable user) is specified; demo negative assertions cover the local-branch rules at the UI level. Residuals (service-level guard unit tests, demo-library import) are named known-gaps with backlog notes, not the sole proof of any behavior. Plan-structure advisory: `validate-plan-artifact.mjs` prints 5 generic FAILs for this plan (Date, Status, Complexity metadata, overview section, Phase Completion Rules) that do not apply to phase-program stubs: it is the same family as the accepted Phase 02 plan (6 identical-class FAILs) and Phase 03 plan (2), and `validate-phase-stub.mjs` reports 0 failures. The `Date:` and `Status:` FAILs clear once this contract is present.
- Breaking changes: PASS — bootstrap gains 2 keys (16 → 18) in the same release as the frontend guard `parseSchoolData`; `SCHOOL_SCHEMA_VERSION` stays 3 (an old API cache without the keys is ignored until the next bootstrap; an old local snapshot is upgraded by `upgrade()` with empty collections); `import/plan.ts` and `school-import.ts` need no change (zod object strips unknown keys; demo library is empty); `GET /uploads/:id{,/download}` widens only for library-linked files and falls through to unchanged logic otherwise; no existing route, response shape, or activity action changes (5 actions added).
- Security surface: PASS — after fixes (STRIDE): spoofing n/a (existing JWT); tampering (strict zod, metadata read from DB, PATCH cannot swap file or creator, idempotent attach with composite PK, unique `attachment_id`); repudiation (activity row per mutation, same transaction); information disclosure (per-record `canAccessAttachment` for library files, role-filtered bootstrap, request evidence stays student-invisible because the request block runs first, no user rows pulled for teacher/student, raw creator/attacher UUIDs accepted); denial of service (field limits, 5 MB upload cap unchanged); elevation of privilege (teacher/student attach 403 by `requireRole`, manager attach limited to own-team lessons, edit limited to creator or admin, library block never returns false so no shadowing; it can only add access, and only for linked non-cancelled lessons). Residual: a request can already cite any attachment id (see backlog note) which grants only the existing request-evidence audience.
- Section A feasibility (Schema and migration): PASS — columns, FKs (`restrict` on `attachment_id` and `library_item_id`, `cascade` on `lesson_id`), composite PK, array default via `sql\`'{}'::text[]\`` all match existing drizzle conventions (`lesson_plans.focus`, array-returning table callback); highest-risk edit: SQL review before `db:migrate` against the shared dev DB (E2).
- Section B feasibility (routes, `scope.ts`, bootstrap, activity): PASS — insertion point and fall-through semantics verified; `managerOwnsTeacher`, `managerTeam`, `logActivity`, `AppError` helpers exist; `toRecord` needs the link `id` (P1); highest-risk edit: the `canAccessAttachment` block, tripwired by a smoke run after Step B (E1, E6).
- Section C feasibility (frontend data layer): PASS — `SchoolCollections`/`createEmptySchool`/`COLLECTION_KEYS`/`upgrade()` all enumerate or merge collections as the plan assumes; `repositories.ts` needs `entity.id` (P1); permissions switch is exhaustive (P3); `storageKey` needed for demo download (P4); highest-risk edit: types plus permission rule, caught by `typecheck`.
- Section D feasibility (UI): PASS — attach surfaces confirmed (`ManagerSchedule` dialog union + `extras.canManage`, `ManagerStudents` dialog union, `ManagerWorkspace` Curriculum nav at line 56), `downloadAttachmentFile` works in both modes, teacher empty-state branching handled (P8); highest-risk edit: TeacherLessons conditional rendering.
- Section E feasibility (tests and gates): PASS — smoke helpers `upload`/`download`/`call`/`check`/`expectStatus` and fixtures (managerA/B, teacherA/B, studentA/B/Zero) exist; e2e helpers `apiLogin`, `apiCall`, `createDisposableUser`, `archiveUser`, `setCreditBalance`, `lessonAt`, `openTeacherLesson`, `pdfBuffer`, `downloadBytes` exist; gate commands match `tests/all-tests.md`; highest-risk edit: shared `smoke.ts` (append-only, self-contained domain).

Open gaps: none unresolved. Deferred (not counted as CONCERN/FAIL):
- Frontend unit tests for `services/library.ts` guards (local branch): known-gap: documented as NEW PLAN REQUIRED — see backlog/frontend-library-service-unit-tests_NOTE_24-11-26.md (Phase 05 Vitest absorbs)
- Demo-mode library data not carried by the one-time import: known-gap: documented as NEW PLAN REQUIRED — see backlog/library-import-and-demo-data_NOTE_24-11-26.md
- `PATCH /lessons/:id` accepts `lessonPlanId` without plan/status validation and the plan-attach route trusts client attachment metadata: known-gap: documented as NEW PLAN REQUIRED — see backlog/lesson-plan-attach-hardening_NOTE_24-11-26.md
- Orphaned uploads and detached plan files are never cleaned up: known-gap: documented as NEW PLAN REQUIRED — see backlog/orphaned-upload-cleanup_NOTE_24-11-26.md
- `POST /requests` stores any client-supplied `attachmentId` without ownership validation (observed at `requests.ts:39,148`; confirm at UPDATE PROCESS): known-gap: documented as NEW PLAN REQUIRED — see backlog/request-attachment-ownership_NOTE_24-11-26.md

### What This Coverage Does NOT Prove

- Contract test (AC-2): proves key lists, types, route presence, and anonymous 401, not any authorization or data behavior.
- Smoke (AC-3 to AC-7, P4-R): proves rules against local Postgres and real files in a temp upload dir, with the auth limiter at the 100000 override; not browser behavior, not production storage, not concurrent attach/archive races (a race between archiving an item and attaching it is not asserted), and not behavior with a very large library (no pagination exists by design at school scale).
- E2E API spec (AC-8): proves one manager, one student, one unrelated student, and one teacher path with a PDF; not every role pair, not other file types, not 390px layout.
- E2E demo spec (AC-9): proves the local happy path plus UI-level negatives (picker excludes archived, no Materials on completed lessons, no teacher attach control); not the service-level `assertCan` guards in isolation (known-gap), not IndexedDB quota limits.
- Migration gate (AC-1): proves additive SQL applies twice on this dev DB, not a rollback path and not behavior on a populated production database.
- Static gates (AC-10): prove types, lint, and only-additive DB file changes, not runtime behavior.
- Agent-probe (AC-11): a judgment of layout and copy at two viewports, not an automated assertion; it also carries in the visual check that stayed pending from Phase 03 (P3-13).

### High-risk pack

Required: yes. Risk classes: schema/data migration (migration `0005`), permission/secret/trust-boundary logic (attachment download scope), public API contract (4 new routes, bootstrap keys). `mustStopBeforeFinalize: true`.
Artifacts (execute-agent produces; manual-first, not a blocking hook) in `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/harness/phase-04-library/`:
- `risk-gate.json`: riskClass, workDescription, approver, `mustStopBeforeFinalize: true`.
- `context-snippets.json`: file:line citations for the schema tables, the migration SQL, the new `canAccessAttachment` block, the bootstrap role filters, `POST /library` eligibility checks, the attach ownership check, and `lesson.attachLibraryItem`.
- `verification.json`: steps with PASS/FAIL covering the happy path and boundaries: duplicate attachment 409, request-evidence 422, other-team manager attach 403, teacher/student attach 403, student of a cancelled lesson download 403, unrelated student 403, archived item still downloadable by an already-linked student, Phase 02 request-evidence still student-invisible, migration second run no-op.
- `review-decision.json`: explicit APPROVE or REJECT with rationale and timestamp from a reviewer (`vc-code-reviewer` or equivalent), recorded before UPDATE PROCESS closes the phase.
- `adversarial-validation.json`: scenarios with `ruled_out` and rationale, at minimum: student guesses an attachment id of a library file not linked to their lessons; student of a cancelled lesson keeps downloading; manager turns a request-evidence file or another user's upload into a library item; teacher attaches by calling the route directly; PATCH mass-assignment of `attachmentId`/`createdBy`; archived item re-exposed to managers; library block shadows or bypasses the plan block; teacher/student bootstrap leaking another student's links or manager user rows; a request citing a library attachment id (ruled_out: false for the pre-existing unvalidated request attachment id, carried by the known gap; grants only the existing request-evidence audience).
Validate with `node .claude/skills/vc-risk-evidence-pack/scripts/validate-risk-artifacts.mjs process/features/launch-readiness/active/lumina-v1-finish_23-11-26/harness/phase-04-library`. If the pack is missing at closeout, report that explicitly; do not imply the phase is proven.

### Backlog artifacts to create during durable capture

All in `process/features/launch-readiness/backlog/`:
- `frontend-library-service-unit-tests_NOTE_24-11-26.md`: Vitest cases for `services/library.ts` local-branch guards and `permissions.ts` library actions (Phase 05 owns the runner).
- `library-import-and-demo-data_NOTE_24-11-26.md`: extend `school-import.ts` and the browser import capture to carry demo library items and links if a school ever starts a library in demo mode.
- `lesson-plan-attach-hardening_NOTE_24-11-26.md`: validate `lessonPlanId` and status on `PATCH /lessons/:id`; stop trusting client attachment metadata on plan attach.
- `orphaned-upload-cleanup_NOTE_24-11-26.md`: storage growth from unreferenced uploads and detached plan files; sweep job or admin tool.
- `request-attachment-ownership_NOTE_24-11-26.md`: `POST /requests` should check the cited attachment exists and was uploaded by the requester (verify at UPDATE PROCESS before filing).

### Known gaps on record

- Service-level local-branch guards (archived item, lesson status, no teacher/student grant) are only proven through UI-level negatives in the demo spec until Phase 05 adds a unit runner. Accepted: demo mode is the local/rollback path; the API rules are proven by smoke.
- Demo library data does not import (D7). Accepted: the demo library seed is empty and no real school has demo library data.
- Items 1-3 of the plan's out-of-scope carry-outs (lessons PATCH, orphaned uploads, plan-attach metadata) plus the request attachment id observation are pre-existing and backlogged, not part of this phase.
- AC-11 screenshots run in EVL; if they cannot run, the phase report must say so explicitly (P3-13 precedent).

Gate: PASS (0 FAILs, 0 unresolved CONCERNs; 9 concerns found and fixed in the plan text or as execute-agent instructions, 5 residual known-gaps documented as backlog)

Accepted by: n/a (Gate PASS; no CONDITIONAL concerns to accept). Validate agent self-decided the V4 menu per instruction (user not in /goal autonomy; recommended option taken for each menu item).

---

**Supplement note 24-11-26 (Step F):** Step F (review fixes F1-F5, AC-12..AC-18) was added after this validate-contract was written (inner-pvl: phase-04, Gate: PASS covers Steps A-E only). A supplement validate (vc-validate-agent, scoped to Step F: V1-V7 on the new section, test gates from `### Step F gates`) is REQUIRED before EXECUTE of Step F. Steps A-E gates above are unchanged and must remain green.

---

### Step F Validate Contract Addendum

Status: PASS
Date: 24-11-26
date: 2026-11-24
generated-by: inner-pvl: phase-04
supersedes: Phase 04 contract (Step F scope only) — the A-E contract above (2026-11-24, inner-pvl: phase-04) stays in force for Steps A-E; this addendum adds the Step F gates and instructions and replaces only the Step F supplement note above.

Parallel strategy: sequential
Rationale: 4/7 signals (S2 schema/API/auth surface, S4 phase program, S6 high-risk: authorization + file-system trust boundary + schema CHECK, S7 5+ files; S1 not met: 2 workspaces, S3/S5 not met since decisions are locked and user-approved). Fit overrides the HIGH score: F1 -> F4 -> F2 -> F3 -> smoke/e2e is a dependent chain (the frontend contract follows the backend contract; smoke and e2e share one dev DB and fixed ports 3000/3100/4000/4100). One opus `vc-execute-agent`, backend first.
V2 note: Layer 1 (4 dimensions) and Layer 2 (F1-F5) were run in-session by the validate agent (a fire-and-forget subagent cannot spawn more agents). Evidence read from source: `courses.ts:81-87,609-623`, `uploads.ts` (whole file), `library.ts:150-209,268-331`, `school.ts:340-355,634`, `schema.ts:1-16,241-269`, `smoke.ts:872-936,1235-1250,1376-1412`, `types.ts:116-137`, `ManagerLibrary.tsx:13-24`, `services/uploads.ts`, `services/curriculum.ts:255-285`, `api/curriculum.ts:44-50`, `api/uploads.ts`, `errors.ts:45-52`, installed `drizzle-orm/pg-core/checks.d.ts` (drizzle-orm 0.38.4, drizzle-kit 0.30.6), `vitest.config.ts`, the registry Step F addendum, and the Phase 05/06 plans (no overlap). V4 menu choices recorded (user not in /goal; recommended option taken for each): net gate PASS; strategy sequential (1 opus executor); cost guard not triggered; test gates as tabled below; V5 = "Accept" (no /goal print: BRANCH B, the umbrella `## Stable Program Goal` governs, so no goal block is written to this phase plan).

### Step F strategy options (7-signal score 4/7)

| Strategy | Agent count | Model | Cost guard | Fit |
|---|---|---|---|---|
| Sequential (recommended) | 1 executor | opus | none | Dependent chain, shared DB and ports |
| Parallel subagents | 2 editors (backend F1/F3/F4, frontend F2.4/F1.4) + 1 tester = 3 | 2 opus + 1 sonnet | none | Frontend contract is tiny; both touch `smoke.ts` and `library.ts`; low payoff, drift risk |
| Workflow | 8 steps (F-1..F-8) x 1 agent = 8 (+ fix cycles) | opus for code steps | none | Overkill, item count known |
| Agent team | 3 members (backend opus, frontend opus, security reviewer sonnet) x 2 rounds = 6 | mixed | none | Only if the user wants live security review of F1; would need TeamCreate + shared task list + SendMessage, not bare parallel subagents |

Phase end: EVL = a spawned `vc-tester` (sonnet) re-running the Step F gates; the high-risk review decision = a spawned `vc-code-reviewer` (sonnet).

### Step F plan updates applied (24-11-26)

No plan-text rewrite is needed; each finding below is carried as an execute-agent instruction (F-E0..F-E15) that overrides the cited Step F line where they differ.

- [x] FP1 (smoke line 1402 contradicts F2): `smoke.ts:1402` currently asserts `managerBoot.users[managerC]` exists ("manager bootstrap names the library creator"). F2 removes exactly that behavior, so the existing check turns red. F5 (iv) only says "add"; it must REPLACE (F-E1).
- [x] FP2 (F5 (g) raw `../.env` insert): `attachments.storage_key` is UNIQUE (`schema.ts:232`), so a second smoke run inserting `../.env` fails with 23505; and a key aimed at the real `backend/.env` risks reading real secrets into a test body. Replaced by a per-run canary file in the system temp dir (F-E3).
- [x] FP3 (`resolveUploadPath` portability): `startsWith("..")` wrongly rejects a legitimate name like `..hidden.pdf`; the Windows-path cases give the opposite answer on Linux (a `C:\...` key is a harmless literal filename on POSIX), and Phase 06 runs vitest on Linux CI. Fixed with an exact `..` segment check, an injectable path implementation, and `\0` / `:` rejection (F-E2).
- [x] FP4 (`.map(libraryItemRecord)` at `school.ts:634`): adding a second optional parameter makes `Array.map` pass the index as `creatorName`. Use an explicit arrow (F-E6).
- [x] FP5 (F4 API confirmed): `check(name, SQL)` is exported by `drizzle-orm/pg-core` 0.38.4 (`checks.d.ts`, re-exported from `index.d.ts`); `schema.ts` imports from `drizzle-orm/pg-core` (lines 2-16) but not `check`, and `libraryItems` has no third argument yet. The vc-docs-seeker confirmation in F4.2 is already satisfied by this check (F-E7).
- [x] FP6 (migration gate cannot see untracked files): `0005_*.sql` and `meta/0005_snapshot.json` are UNTRACKED (`??` in git status), so `git diff --name-only -- backend/src/db` will not list them and cannot prove "0005 unchanged". Use `git status --porcelain` plus content hashes (F-E8).
- [x] FP7 (race assertion wording): after retry-once-then-409, an attach racing a detach may legitimately answer 409 on a double vanish; the assertion for the race case is "never 500; attach in {200, 409}, detach in {200, 204}", while two parallel attaches must both be 200 (F-E9).
- [x] FP8 (F5 (f) needs unique per-run keys): to prove "no `attachments` row was created for client-supplied keys", the attempted `storageKey` and `id` are per-run unique and the check selects those exact values (F-E4).
- [x] FP9 (F4 violation-test details): drizzle-orm 0.38 does not wrap driver errors, so the postgres.js error carries `code === "23514"` directly; read `error.code ?? error.cause?.code`. The failing insert leaves no row; use a fresh upload id so the test creates no stray raw `attachments` row (F-E10).

### Step F execute-agent instructions

- F-E0 Order and gates: F-1 .. F-8 exactly as the plan's Step F checklist; per-step gates `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend`, one at a time (shared DB and ports). Do NOT run `npm run smoke` between F-3 and F-7: the existing smoke still sends the old attach shape until F-7 and fails there by design. Run smoke and e2e once each at F-8. Confirm ports 3000, 3100, 4000, 4100 are free first.
- F-E1 Smoke line 1402: REPLACE `check(Boolean(managerBoot.users?.[uid("managerC")]), "manager bootstrap names the library creator")` with `check(!managerBoot.users?.[uid("managerC")], "manager bootstrap pulls no other-manager user row because of the library")`, and add `check(managerBoot.libraryItems?.[itemC]?.createdByName === <managerC name>, ...)`. Read the name from the admin bootstrap (`adminBoot.users[uid("managerC")].name`; fetch `bootstrapOf("admin")` earlier if needed) rather than hard-coding the smoke naming pattern. Before inverting, confirm managerC is not referenced for another reason in managerA's view (managerC has no lessons or students; if something else pulls it, use a fresh library-only manager). Teacher/student items: assert `createdByName` is `undefined` and keep the existing 1387/1396 checks.
- F-E2 `backend/src/lib/upload-path.ts` (refines F1.2): signature `resolveUploadPath(uploadDir: string, storageKey: string, pathImpl: Pick<typeof path, "resolve" | "relative" | "isAbsolute" | "sep"> = path): string | null`. Return `null` if `storageKey` is empty or contains `\0` or `:` (legit keys are `{uuid}{ext}`; `:` covers Windows drive letters and alternate data streams). Then `const root = pathImpl.resolve(uploadDir); const target = pathImpl.resolve(root, storageKey); const rel = pathImpl.relative(root, target);` return `null` when `rel === ""`, `rel === ".."`, `rel.startsWith(".." + pathImpl.sep)`, or `pathImpl.isAbsolute(rel)` (a different drive or UNC target gives an absolute `rel` on win32); otherwise return `target`. Do NOT use a bare `startsWith("..")`. Tests (`backend/tests/upload-path.test.ts`, red-first): default-path cases on any OS: `{uuid}.pdf` inside, `a/b.pdf` inside, `..hidden.pdf` inside (regression for the false positive), `../.env` null, `a/../../.env` null, `/etc/passwd` null, `""` null, `"."` null, `"../up-evil/x"` with a sibling directory sharing the upload dir's name prefix null, a key with `\0` null. Windows semantics asserted deterministically on every OS through `pathImpl = path.win32`: `C:\Windows\win.ini` null, `\\server\share\x` null, `..\x` null, `a\..\..\x` null, `a/..\..\x` null (mixed separators), uploadDir `C:\Up` with key `..\Up-evil\x` null, key `a.pdf` inside. Total new tests >= 14 (the plan's >= 52 total holds with margin).
- F-E3 Smoke traversal fixture (replaces F5 (g); DECISION on the raw-insert check): do NOT insert a `../.env` row and do NOT point at any repo or secret file. Two layers: (a) the vitest unit tests are the primary containment proof; (b) one hybrid API check with a canary. In the `uploads` scenario: `canaryName = "smoke-canary-" + runId + ".txt"`, `canaryPath = join(uploadDir, "..", canaryName)` (the system temp dir: outside `lumina-smoke-uploads` and outside the repo; `uploadDir` is the module constant at `smoke.ts:56`); write a sentinel string `CANARY-{runId}` there; insert one `attachments` row directly via `db` (add `attachments` to the schema import at line 27) with `storage_key = "../" + canaryName` (unique per run, so no 23505 on re-runs), name `smoke-traversal-{runId}.txt`, type `text/plain`, uploadedBy the admin; assert `download(tok("admin"), rowId)` returns 404 and the body does not contain the sentinel; control: a normally uploaded file still downloads 200. In a `finally` (always): delete that `attachments` row by id and `rmSync(canaryPath, { force: true })`. Never print file contents or `DATABASE_URL`; on failure print only the status code. The row is unreferenced, so deletion is safe. No `.env`, no secrets.
- F-E4 Smoke (a)-(f): every attach call sends exactly `{ attachmentId }` (update `smoke.ts:891-893` and `:918-920`). (c) shapes `{ attachmentId, storageKey: "../smoke-evil-{runId}" }`, the old `{ id, name, type, size, storageKey }`, and `{}` each give 400 `VALIDATION_ERROR`. (f) after (c): `select count(*) from attachments where storage_key like 'smoke-evil-%{runId}%' or id = <the fresh uuid used as client id>` is 0, and the plan's `attachmentIds` holds only legitimately attached ids. (d) request evidence: reuse the request-evidence fixture pattern from the `library` domain (a request citing the upload), then attach returns 422 `ATTACHMENT_NOT_ELIGIBLE`. (a) managerB attaching managerA's upload gives 403: managerB must be able to edit the target plan (build a managerB-owned course/plan for this check), otherwise the 403 would come from `assertPlanEditable` and prove the wrong rule.
- F-E5 F1.1 handler: `assertPlanEditable` first, strict schema before any DB read, response unchanged. The attach is a read-modify-write on `lesson_plans.attachment_ids` (pre-existing lost-update race when two different files are attached to one plan concurrently); accepted, not changed here, recorded in the backlog note. Admin may attach any upload; a manager only their own uploads (an admin-uploaded file needs the admin to attach it; same rule as `POST /library`).
- F-E6 F2: change `school.ts:634` to `visibleLibraryItemRows.map((row) => libraryItemRecord(row, canSeeNames ? nameById.get(row.createdBy) : undefined))` (never pass `libraryItemRecord` directly to `.map`; the index would arrive as `creatorName`). `nameById` comes from the already-loaded unfiltered `userRows`. Delete only the manager-only block at `school.ts:342-351`; `createdBy` and `attachedBy` ids stay on the rows; `SCHOOL_SCHEMA_VERSION` stays 3; `BOOTSTRAP_COLLECTION_KEYS` stays 18. `types.ts:118-130` `LibraryItem` gains `createdByName?: string`; `SchoolUser.name` exists (`types.ts:23`) so `services/library.ts:124` sets `createdByName: actor.name`. `parseSchoolData` must accept the extra optional key; confirm with typecheck and the contract test.
- F-E7 F4 `schema.ts`: add `check` to the `drizzle-orm/pg-core` import, convert `libraryItems` to `pgTable("library_items", {...}, (table) => [check("library_items_status_check", sql`${table.status} in ('published', 'archived')`)])`, update the `:243` comment. `npm run db:generate` must produce exactly one new `0006_*.sql` holding a single `ALTER TABLE "library_items" ADD CONSTRAINT "library_items_status_check" CHECK (...)`; any interactive prompt, DROP, recreate, or type change = STOP and report NEEDS_CONTEXT. F4.1 pre-check (read-only): `select count(*)::int from library_items where status not in ('published','archived')` through a throwaway script kept OUTSIDE the repo (scratchpad) using the `postgres` driver and `backend/.env` `DATABASE_URL`, refusing a non-local host like smoke does, never printing the URL; expect `0` before generating; non-zero = BLOCKED, no data change. Never hand-edit journal or snapshots; never `db:push`, `db:reset`, TRUNCATE.
- F-E8 Migration and DB-file gate (replaces the `git diff --name-only -- backend/src/db` line in Step F gates): at F-1 record `sha256sum` of `0005_zippy_thunderbolt_ross.sql` and `meta/0005_snapshot.json`; at F-8 re-compute and require identical hashes. Then `git status --porcelain -- backend/src/db` must list exactly: `M backend/src/db/schema.ts`, `M backend/src/db/migrations/meta/_journal.json`, `?? migrations/0005_*.sql`, `?? migrations/meta/0005_snapshot.json` (untracked until the Phase 04 commit), plus the NEW `?? migrations/0006_*.sql` and `?? migrations/meta/0006_snapshot.json`; nothing else. `npm run db:migrate` twice (second is a no-op).
- F-E9 Smoke `library` (F5 (ii), (iii), (i)): `Promise.all` of two `POST /library` for one fresh upload gives statuses sorted equal `[201, 409]`. Two parallel `POST /lessons/:id/library-items` for one item: both 200 and exactly one `lesson.libraryAttached` activity row for that lesson+item. Attach racing detach (a few bounded rounds): every response `!== 500`, attach in {200, 409}, detach in {200, 204}, end state consistent. (i) overlap: a file attached through the new `{attachmentId}` route to a published course plan AND turned into a library item: enrolled student/teacher 200, unrelated student 403, then archive the item and detach the library link and re-assert the enrolled student still downloads 200.
- F-E10 F5 (v): use a fresh upload id (via `POST /uploads`) as `attachment_id` and the admin id as `created_by`; `try { db.insert(libraryItems).values({ ..., status: "bogus" }) } catch (error) { code = error.code ?? error.cause?.code; check(code === "23514") }`; afterwards confirm no row for that attachment exists. F4.4: `libraryStatus(value)` throws on any other value; add a vitest case only if the helper can be exported and exercised without a DB; otherwise the smoke check carries it.
- F-E11 F1.3 log line: `request.log.warn({ attachmentId: attachment.id }, ...)` (id only). `POST /uploads` unchanged. Optional hardening NOT in scope, record in the backlog note: sanitise `extname(file.filename)` to `/^\.[A-Za-z0-9]{1,10}$/` or empty (on Windows an extension like `.pdf:stream` could create an alternate data stream inside the upload directory; contained, not a traversal).
- F-E12 e2e: `curriculum-library.spec.ts` asserts the creator display name in the manager Library tab (stable locator from existing text/test ids; no `globals.css` or `playwright.config.ts` edits); `demo/regression.spec.ts` asserts the local creator name and `apiCalls` equals `[]`. `uploads.spec.ts` must pass UNCHANGED (the UI drives the new `{attachmentId}` call). The A-E cleanup rules (credit restore, archive created items, disposable users) still apply.
- F-E13 High-risk pack (`harness/phase-04-library/`): extend `risk-gate.json` (file-system trust boundary / path traversal and authorization-contract change; `mustStopBeforeFinalize: true`); update `verification.json` with Step F steps (strict attach 400/403/404/422/200, no `attachments` row created, traversal canary 404, containment unit cases, no other-manager user row, concurrency no-500, CHECK violation 23514, migration twice no-op, Phase 02 uploads regression); update `adversarial-validation.json` (client-supplied `storageKey` traversal via plan attach; absolute and Windows-drive keys; `..` sibling-prefix directory; empty/`.` key reading the directory; mass-assignment of `id`/`uploadedBy` on attach; manager attaching another manager's or request-evidence file; other managers' user-row leak through the library; attach/detach race returning 500; bogus status; pre-existing hostile rows in dev data: ruled_out true for read-time containment, residual noted for the historical-row audit and admin school-import `storageKey`). `review-decision.json` is written AFTER the final review by a spawned `vc-code-reviewer` (APPROVE or REJECT + rationale + timestamp); until it exists the work is not "ready". Validate with `node .claude/skills/vc-risk-evidence-pack/scripts/validate-risk-artifacts.mjs process/features/launch-readiness/active/lumina-v1-finish_23-11-26/harness/phase-04-library`.
- F-E14 No mutation of existing dev rows; the F1.5 audit of historical `attachments.storage_key` values is a read-only backlog item for UPDATE PROCESS, never part of EXECUTE. Registry: the Step F addendum already matches; no overlap with Phase 05 (`lessons.ts`, `globals.css`, `data.ts`, vitest runner untouched) or Phase 06 (declares no migration; its Linux CI runs `upload-path.test.ts`, hence the injectable `pathImpl`).
- F-E15 Closeout counts for UPDATE PROCESS (do not edit docs during EXECUTE): vitest files/tests (>= 7 / >= 52 expected), smoke domains/checks (>= 16 / >= 594), e2e (>= 27 API + 4 demo), migration `0006`, `process/context/{all-context,tests/all-tests,database/*,auth/*}.md` refresh, backlog notes. Commit rules unchanged (separate execution and process commits on `developing`, only on explicit user request).

### Step F test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-12 | Plan attach takes only `{attachmentId}` (strict); 403 other user's upload, 404 unknown id, 400 extra/legacy keys incl. `storageKey` and `{}`, 422 request evidence, admin any 200; no `attachments` row is created or changed | Hybrid | `npm run smoke` (`uploads` domain, F5 (a)-(f) per F-E4) — precondition: local Postgres, `backend/.env`, port 4100 free | B |
| AC-13 | Download never serves a path outside `UPLOAD_DIR` (traversal, absolute, drive, UNC, empty, `.`, sibling prefix) | Fully-Automated | `npm run test --workspace @lumina/backend` (`backend/tests/upload-path.test.ts`, F-E2 cases) | B |
| AC-13b | A stored traversal key returns 404 over HTTP with no file content (canary); a legitimate key still returns 200 | Hybrid | `npm run smoke` (`uploads` domain, canary fixture per F-E3) | B |
| AC-14 | Manager bootstrap has no other-manager user row via the library; `createdByName` shipped for admin/manager, absent for teacher/student; UI shows it; demo shows the local creator name | Hybrid | `npm run smoke` (`library` bootstrap checks incl. replaced line 1402) + `npm run e2e` (`curriculum-library.spec.ts`, `demo/regression.spec.ts`) — precondition: seeded DB, ports 3000/3100/4000 free | B |
| AC-15 | Concurrent create/attach/attach-vs-detach never return 500; duplicate create = one 201 + one 409; one activity row per real attach | Hybrid | `npm run smoke` (`library`, F-E9) | B |
| AC-16 | Migration 0006 is one additive CHECK, applies twice, 0005 files unchanged, DB rejects an invalid status (23514), mapper strict | Hybrid | `npm run db:migrate` (twice) + SQL review + F-E8 hash/porcelain check + `npm run smoke` (`library`, F-E10) — precondition: local Postgres + `backend/.env` | B |
| AC-17 | A file that is both a plan attachment and a library item keeps plan-block access for enrolled student/teacher and still blocks unrelated users, even after archive/detach of the library link | Hybrid | `npm run smoke` (`library`, F-E9 (i)) | B |
| AC-18 | No regression: Phase 02 uploads, Phase 03 auth, all A-E gates, demo fence | Hybrid | `npm run smoke` (`uploads`, `credits`, `auth` in the full run) + `npm run e2e` (`uploads`, `auth`, `booking`, `cancellation-refund`, `credit-concurrency`, `curriculum-library`, demo regression) | A |
| AC-18s | Static soundness and whitespace | Fully-Automated | `npm run typecheck`; `npm run lint`; `git diff --check` | A |

Failing stubs (Fully-Automated rows; red-first starting points, not on-disk files):

```
// AC-13 (backend/tests/upload-path.test.ts)
test("should return null for a storage key that escapes the upload directory", () => { throw new Error("NOT IMPLEMENTED — TDD stub: resolveUploadPath('../.env') === null") })
test("should return null for absolute, drive-letter, UNC, empty and dot keys", () => { throw new Error("NOT IMPLEMENTED — TDD stub: resolveUploadPath absolute / C:\\ / UNC / '' / '.' === null") })
test("should return null for a sibling directory that shares the upload directory name prefix", () => { throw new Error("NOT IMPLEMENTED — TDD stub: resolveUploadPath('../up-evil/x') === null") })
test("should keep a legitimate key and a name starting with two dots inside the directory", () => { throw new Error("NOT IMPLEMENTED — TDD stub: resolveUploadPath('..hidden.pdf') is inside") })
// AC-18s is command-only (no stub)
```

Legacy line form (retained for existing consumers):
- Containment unit: [Fully-automated: `npm run test --workspace @lumina/backend`]
- Static: [Fully-automated: `npm run typecheck`] | [Fully-automated: `npm run lint`] | [Fully-automated: `git diff --check`]
- Migration: [hybrid: `npm run db:migrate` twice + F-E8 hash and porcelain check + local Postgres + backend env file]
- Attach, library, traversal canary, bootstrap, concurrency, CHECK: [hybrid: `npm run smoke` + local Postgres + backend env file, port 4100 free]
- UI and demo creator name, Phase 02 regression: [hybrid: `npm run e2e` + seeded Postgres + ports 3000/3100/4000 free]
- Historical `attachments.storage_key` audit, school-import client `storageKey`, symlink-safe resolution, extension sanitising: [known-gap: documented as NEW PLAN REQUIRED — see Step F backlog artifacts below]

Never a gate: `npm run db:reset`, `db:push`, TRUNCATE, and any direct write of a repo or secret path. The plan's `### Step F gates` block stands except its `git diff --name-only -- backend/src/db` line, which F-E8 replaces. Expected counts (>= current): vitest >= 7 files / >= 52 tests; smoke >= 16 domains / >= 594 checks (net: F5 adds checks and line 1402 is inverted, not removed); e2e >= 27 API + 4 demo.

### Step F dimension findings

- Infra fit: PASS — all anchors exist (`courses.ts:81-87,609-623`, `uploads.ts:90-93`, `school.ts:342-351,634`, `library.ts:84,94,295-327`, `schema.ts:243,262`); `upload-path.ts`, `upload-path.test.ts`, `0006_*` are intended new files; `vitest.config.ts` includes `tests/**/*.test.ts`; smoke's `uploadDir` is `tmpdir()/lumina-smoke-uploads` (`smoke.ts:56`), so a canary in its parent sits outside the upload directory and outside the repo. The journal ends at 0005 (modified; 0005 files untracked), so `db:generate` yields `0006`.
- Test coverage: PASS (after FP1-FP4, FP6-FP9) — every developed behavior has a Fully-Automated or Hybrid gate (AC-12 to AC-18); the Known-Gap class (historical rows, import provenance, symlinks) is a named residual with a backlog stub, never the sole proof of a behavior.
- Breaking changes: PASS — one intentional contract change: plan-attach body `{id,name,type,size,storageKey}` -> `{attachmentId}`. Verified callers: `services/curriculum.ts:267` (via `api/curriculum.ts:47-48`), `services/uploads.ts:36` (passes the server attachment, so `file.id` is the uploaded id), `smoke.ts:891,918`; `ManagerCurriculum.tsx:147` and e2e `flows.ts`/`uploads.spec.ts` go through the UI; no e2e, import, or script posts to the route directly. Demo branch and `SCHOOL_SCHEMA_VERSION` (3) unchanged; no new bootstrap key; `createdByName` is optional so old API caches and teacher/student payloads stay valid; the CHECK cannot reject existing rows once the F4.1 pre-check returns 0.
- Security surface: PASS — STRIDE after fixes: tampering/path traversal (route accepts no client path; read-time containment protects pre-existing rows; `\0`/`:` rejection; relative-segment check instead of string prefix); information disclosure (404 identical to a missing file, id-only log, no body on traversal; manager bootstrap no longer pulls other managers' user rows); elevation of privilege (uploader-or-admin and request-evidence rules on attach, same as `POST /library`); denial of service (strict body, no new unbounded input); repudiation (activity rows unchanged; plan attach wrote none before and writes none now). Residuals accepted and backlogged: UPLOAD_DIR symlinks not resolved; admin school-import `storageKey` is client-supplied (read-time containment makes it harmless); plan `attachment_ids` read-modify-write race; `POST /requests` attachmentId ownership (existing note); extension sanitising.
- F1 feasibility (strict plan-attach + containment): PASS — highest-risk edit is the helper's Windows behavior, mitigated by F-E2 (injectable `path.win32` tests, exact `..` segment check). Windows analysis: a same-drive absolute key resolves to a `..\` relative; a different drive or UNC key yields an absolute `rel` (caught by `isAbsolute`); `""` and `.` give `rel === ""`; mixed separators are normalised by `path.win32`; case is compared case-insensitively by `win32.relative`; `\0` and `:` rejected up front. All `storageKey`-to-filesystem uses in `backend/src` are covered: the only reader is `uploads.ts:90-93` (fixed) and the only writer is `uploads.ts:41-42` (server-generated key); `school.ts:475` only serialises; `school-import.ts:122` only stores.
- F2 feasibility (createdByName): PASS — `SchoolUser.name` exists; the mapper index-argument pitfall is handled (F-E6); the old smoke assertion is inverted (F-E1); the contract test needs no change (18 keys, version 3); `attachedBy` is never displayed (only `services/library.ts:177`, `types.ts:137`).
- F3 feasibility (attach race): PASS — under READ COMMITTED a concurrent detach can commit between the `DO NOTHING` insert and the follow-up select; retry-once-then-409 is correct and the activity row is written only by the inserting attempt; assertion wording fixed (FP7).
- F4 feasibility (CHECK migration): PASS — `check` exported by drizzle-orm 0.38.4; a single additive `ALTER TABLE ... ADD CONSTRAINT` is expected from drizzle-kit 0.30.6; the pre-check is a read-only count; the constraint is consistent with the `'published'` default.
- F5 feasibility (tests): PASS — counts rise to >= 7 / >= 52 with the planned cases (>= 14 in F-E2); smoke helpers (`call`, `download`, `upload`, `bootstrapOf`, `check`, `expectStatus`, `db`) exist; `db` and `libraryItems` are already imported, `attachments` must be added to the import at `smoke.ts:27`.

Open gaps: none unresolved. Deferred (not counted as CONCERN/FAIL):
- Historical `attachments.storage_key` audit (rows written by the old plan-attach route) and admin school-import client `storageKey` provenance: known-gap: documented as NEW PLAN REQUIRED — see backlog/lesson-plan-attach-hardening_NOTE_24-11-26.md (UPDATE PROCESS extends the existing note)
- Symlink-safe resolution of `UPLOAD_DIR`, `extname` sanitising, `lesson_plans.attachment_ids` lost-update race: known-gap: documented as NEW PLAN REQUIRED — see backlog/lesson-plan-attach-hardening_NOTE_24-11-26.md
- `POST /requests` stores any client `attachmentId`: known-gap: documented as NEW PLAN REQUIRED — see backlog/request-attachment-ownership_NOTE_24-11-26.md (verified still true at `requests.ts:39,148`)

### Step F What This Coverage Does NOT Prove

- Vitest `upload-path.test.ts` (AC-13): proves the pure path arithmetic under native and `path.win32` semantics, not real filesystem behavior (symlinks, junctions, Windows reserved device names, case-folding volumes).
- Smoke `uploads` and `library` (AC-12 to AC-17): proves rules against local Postgres and a temp upload dir at the 100000 auth-limiter override; the canary proves one escaping key over HTTP, not every hostile key, and nothing about rows other than the one it inserts; the concurrency checks prove "no 500 and a consistent end state" for small bounded rounds, not every interleaving.
- Migration gate (AC-16): proves the additive CHECK applies twice on this dev DB, not a populated production database and not a rollback.
- E2E (AC-14, AC-18): proves the creator display name in the manager Library tab and the Phase 02/03 flows, not 390px layout, and not that teacher/student screens show no creator name beyond the smoke payload checks.
- Static gates (AC-18s): types, lint, whitespace only.
- Nothing here proves historical rows written by the old plan-attach route are clean; read-time containment makes them harmless to download, but they are not audited (backlog).

### Step F high-risk pack

Required: yes (same location, `harness/phase-04-library/`). Risk classes: permission/secret/trust-boundary logic (file path containment), public API contract (plan-attach body), schema/data migration (0006 CHECK), authorization scope (library creator exposure). `mustStopBeforeFinalize: true`. Update `risk-gate.json`, `verification.json`, `adversarial-validation.json`; write `review-decision.json` only after the final review (F-E13). A missing or stale pack at closeout is reported explicitly; the phase is not "proven" without it.

### Step F backlog artifacts (UPDATE PROCESS writes; all in `process/features/launch-readiness/backlog/`)

- `lesson-plan-attach-hardening_NOTE_24-11-26.md` (update): plan attach now takes `{attachmentId}` only (done in Step F); remaining: read-only audit of `attachments.storage_key` values not matching `{uuid}{ext}`, school-import `storageKey` provenance, symlink-safe resolution, `extname` sanitising, `attachment_ids` lost-update race, `PATCH /lessons` `lessonPlanId` validation.
- `request-attachment-ownership_NOTE_24-11-26.md` (existing, verified still true): no change.

### Step F known gaps on record

- No audit of historical `storage_key` data (deliberately read-only/backlog; no data mutation in this phase).
- Windows reserved device names and symlinks inside `UPLOAD_DIR` are not handled by the pure helper (server-controlled directory; documented limitation).
- AC-11 screenshots from the A-E contract still run in EVL; Step F adds no new screen.

Gate: PASS (0 FAILs, 0 unresolved CONCERNs; 9 concerns FP1-FP9 found and fixed as execute-agent instructions F-E1..F-E13, 3 residual known-gaps documented as backlog)

Accepted by: n/a (Gate PASS; no CONDITIONAL concerns to accept). Validate agent self-decided the V4 menu per instruction (user not in /goal; recommended option taken for each menu item).
