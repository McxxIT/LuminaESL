---
name: plan:lumina-v1-finish-phase-05-parity-polish-and-unit-tests
description: "Lumina ESL v1 Finish — Phase 05: Rebook enrichment, 'credits' UI copy, 390px mobile tab fixes, and frontend Vitest service unit tests"
date: 23-11-26
metadata:
  node_type: memory
  type: plan
  feature: launch-readiness
  phase: phase-05
---

# Phase 05 — Parity Polish & Frontend Unit Tests

**Program:** lumina-v1-finish
**Umbrella plan:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md
**Date**: 23-11-26 (supplemented 24-11-26)
**Status**: VERIFIED (25-11-26; EVL green, review approved by the user; execution commit 5c1b4b9)
**Complexity**: COMPLEX
**Phase status:** VERIFIED (25-11-26)
**Report destination:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-05-parity-polish-and-unit-tests_REPORT_23-11-26.md (flat in the program task folder)

---

## Overview

Five related polish and coverage items grouped as one phase: backend rebook parity, credit wording, mobile CSS, frontend Vitest runner and tests, and Phase 04 carry-ins. No schema, auth, or API-shape change.

## Phase Completion Rules

- `CODE DONE` = all checklist steps applied; `VERIFIED` only when the Exit Gate passes, the EVL regression checks for Phases 01-04 are green, and the phase report is written.
- Known gaps (see Acceptance Criteria) keep their gates CONDITIONAL and must have backlog stubs; they never count as PASS.

## Purpose

Retire the remaining parity, UI-polish, and test-coverage backlog items before final CI/Docker packaging:
1. Align `POST /lessons/:id/rebook` with `resolveLessonDefaults` (fresh room code + next lesson plan; any non-live original may be rebooked) — closes `rebook-enrichment_NOTE_18-11-26.md`.
2. Replace visible "credit hours" / "hrs" credit labels with "credits" wording through a reviewed string table, guarded by a unit test, without touching the `hours` data field or the backend contract (`credit-hours-wording_NOTE_18-11-26.md`).
3. Fix the 390px tab-row overflow and the lesson-material chip name / Remove alignment, measure first, CSS only (`frontend/PROGRESS.md` item 5, `library-polish-followups`).
4. Add **Vitest** to `@lumina/frontend` with fast unit tests over the local-branch school services on `createMemoryAdapter` (`frontend-test-runner_NOTE_18-11-26.md`, `frontend-library-service-unit-tests_NOTE_24-11-26.md`).
5. Phase 04 carry-ins: library notification navigation, one shared upload validator, API-mode visual probe (library screens + Phase 03 P3-13).

---

## Locked Decisions (user, 24-11-26; authoritative)

1. Rebook accepts any non-live original (completed, cancelled, scheduled); a `live` original is rejected with 400.
2. Wording: "credits" for balances and quantities ("3.5 credits", singular "1 credit"); "Lesson credits" for headings and labels; "credit packages" for packages; invoice line "Credits:". Genuine hours stay unchanged.
3. `default-account-password` is a SEPARATE fix after Phase 05 (see Out of Scope).
4. The e2e startup flake is deferred to Phase 06 (`playwright.config.ts` untouched here).

---

## Out of Scope (explicit)

| Item | Disposition |
|---|---|
| `default-account-password_NOTE_24-11-26.md` (HIGH, shared fixed default password for admin-created accounts) | NOT in Phase 05. A separate fix plan after Phase 05 and BEFORE Phase 06 (launch gate; the umbrella and Phase 06 plan already name it). Do not touch `frontend/app/lib/school/api/school.ts` password lines here. |
| `e2e-startup-timeout-flake_NOTE_24-11-26.md` | Deferred to Phase 06 (CI). `frontend/playwright.config.ts` stays untouched in Phase 05. EVL reruns an `npm run e2e` that fails only on a webServer startup timeout once; a second timeout is recorded, not fixed here. |
| Renaming the `hours` field (API, DB, `CreditLedgerEntry`, `CreditPackage`) | Never; contract and `SCHOOL_SCHEMA_VERSION` (3) unchanged. |
| `lesson-plan-attach-hardening`, `upload-write-path-hardening`, `request-attachment-ownership`, `orphaned-upload-cleanup`, `library-bootstrap-scale-and-policy`, `library-import-and-demo-data` | Unscheduled backlog. |
| Demo-mode rebook behavior (`services/bookings.ts:77-88`) | Enrichment unchanged; it already calls `createLesson` (next plan + fresh code), proven by a unit test. ONE addition (PVL P2): the local branch has no original-status gate at all, so it would accept a `live` original that the API now rejects; add the same one-line `live` refusal there (Step 2.4) so both modes honor Locked Decision 1. |
| Any schema change or migration | None (next free migration number stays `0007`, unused). |
| New TabBar component | Not built; CSS-only fix. |

---

## Carried in from Phase 04

Pointers only; details in `process/features/launch-readiness/backlog/`. Disposition after PLAN-SUPPLEMENT:

- `frontend-library-service-unit-tests`: covered by Step 3 (library guards + library permission actions; the `createLibraryItem` happy path needing FileReader/IndexedDB is a documented known gap).
- `library-polish-followups`: chip clipping and Remove alignment -> Step 6; library notification navigation -> Step 5 (category stays "plans", no contract change); shared upload validator -> Step 2; API-mode visual probe + P3-13 -> Step 6.
- Shared surfaces changed by Phase 04 and kept green: `StudentLessons.tsx`, `TeacherLessons.tsx`, `backend/scripts/smoke.ts` (`library` domain), `frontend/e2e/demo/regression.spec.ts`. Baselines to keep or exceed: backend vitest 7 files/61 tests, smoke 16 domains/656 checks, e2e 27 API + 4 demo.

---

## Entry Gate

- Phase 04 complete and closed (24-11-26). Dev DB has migrations through `0006`.

---

## Design (verified against repo at 24-11-26)

### A. Rebook (`backend/src/routes/lessons.ts`, handler at lines 533-581)

Current behavior (verified): status gate at line 543 is `original.status !== "scheduled"` -> 400 "Only scheduled lessons can be rebooked"; insert at lines 556-560 copies `enrollmentId`, `roomCode`, `lessonPlanId` from the original and sets no `planAttachedBy`/`planAttachedAt`.

New behavior:
- Gate: reject only `live` (400, message like "A lesson in progress cannot be rebooked"); completed, cancelled, scheduled are accepted. Role and ownership checks (student own lesson; manager `managerOwnsStudent`; admin any) unchanged and still run before the gate.
- Inside the existing transaction, order stays: `lockStudentCredits` -> slot lookup (400 if not open) -> `getCreditBalance` (400 if < 1) -> `resolveLessonDefaults(tx, { teacherId: original.teacherId, studentId: original.studentId, actorId: request.user.sub })` (`backend/src/lib/lesson-defaults.ts:29-90`, same call shape as `routes/bookings.ts:226` and `routes/lessons.ts:308`) -> insert.
- Insert takes `enrollmentId`, `lessonPlanId`, `planAttachedBy`, `planAttachedAt`, `roomCode` from the defaults; `title` and `focus` still come from the original; `teacherId`, `studentId`, date/time, `endTime`, `createdBy` unchanged. Slot delete, `-1` booking debit, and `lesson.booked` activity unchanged.
- Null enrollment / null plan (no active enrollment for the teacher-student pair, or course plans exhausted) behaves exactly like `POST /lessons`: `enrollmentId`, `lessonPlanId`, `planAttachedBy`, `planAttachedAt` are null, `roomCode` is still fresh. This is documented in a code comment at the handler and in the phase report.
- The collision catch (`isActiveLessonSlotConflict` -> 409) is untouched.
- Public response shape (the created lesson row, status 201) is unchanged.

Smoke (`backend/scripts/smoke.ts`, `rebookScenario` at lines 539-555): keep every existing assertion verbatim (studentR fixtures: +2.5 credits, 403 for another student, rebook with 1.5 -> 0.5, 400 refusal at 0.5). Additions, all inside the existing `rebook` domain:
- At the top of `rebookScenario`, before scheduling the original, create an enrollment for studentR with teacherA on the setup `courseId` (`POST /enrollments`, as managerA, same shape as setup line ~446). studentR currently has NO enrollment (only studentA does), so without this no plan progression is assertable. The 12 setup plans are ample. Verify `courseId` is module-scope (it is assigned in setup at line ~437); studentR is used nowhere outside `rebookScenario`, so no other domain is affected, but full `npm run smoke` is the proof.
- After the existing scheduled-original rebook (res): `GET /lessons/{newId}` as admin; assert `roomCode` differs from the original's, `lessonPlanId` is a non-null string different from the original's plan, `planAttachedBy` is a non-null string, `enrollmentId` equals the new enrollment.
- Top up studentR (`addCredits("studentR", 3)` after the 0.5 refusal, balance 3.5), then for a `completed` original and a `cancelled` original (created via the existing DB-direct helper `insertLibraryLesson("teacherA","studentR",status)` at smoke.ts line ~1306, no debit, no plan counters moved): open a slot, rebook as studentR, assert 201, balance delta exactly -1, new `roomCode` differs from the original's, `lessonPlanId` non-null and distinct from every other active studentR lesson's plan, `planAttachedBy` set, exactly one `lesson.booked` activity on the new lesson id.
- A `live` original (same helper): rebook returns 400 and the balance is unchanged, no slot consumed.
- Count rule: total checks >= 656 (expected to rise by roughly 20). Optional e2e API rebook spec: NOT added (fixture cost: enrollment, credits and an open slot per test for a contract smoke already proves); e2e stays 27 API + 4 demo.

### B. Credit wording (frontend only; table is the contract)

Reviewed string table. Every old string was re-read at its line on 24-11-26 (all line numbers matched; PVL added row 28). If the red-first guard flags any further credit-meaning string not in this table, fix it and log it in the phase report; if it is genuine hours, add it to the in-test allowlist with a reason. "Hours" as a data field name, props like `creditHours`, and `hours` keys are NOT renamed; only rendered text changes.

| # | File:line | Old | New |
|---|---|---|---|
| 1 | `components/LuminaApp.tsx:248` | `{studentCredits.toFixed(1)} hrs` | `{studentCredits.toFixed(1)} credits` (label `LESSON CREDITS` already correct) |
| 2 | `components/manager/ManagerSchedule.tsx:97` | `has {n} credit hours` | `has {n} credits` (rest of the sentence unchanged) |
| 3 | `components/manager/ManagerStudents.tsx:149` | `{n.toFixed(1)} hrs` | `{n.toFixed(1)} credits` |
| 4 | `components/manager/ManagerStudents.tsx:170` | `{n.toFixed(2)} hrs` | `{n.toFixed(2)} credits` |
| 5 | `components/student/StudentBilling.tsx:35` | `${selected.hours} lesson hours added to your wallet.` | `${selected.hours} credits added to your wallet.` (singular "1 credit" handled when hours === 1) |
| 6 | `components/student/StudentBilling.tsx:45` | `Hours: ${transaction.hours}` (invoice line) | `Credits: ${transaction.hours}` |
| 7 | `components/student/StudentBilling.tsx:63` | `AVAILABLE ... {n} <em>hrs</em>` | `... {n} <em>credits</em>` |
| 8 | `components/student/StudentBilling.tsx:64` | `USED THIS CYCLE 3.5 <em>hrs</em>` | `3.5 <em>credits</em>` |
| 9 | `components/student/StudentBilling.tsx:72` | `<span>Hours remaining</span>` | `<span>Credits remaining</span>` |
| 10 | `components/student/StudentBilling.tsx:73` | `0 hrs` / `40 hr plan cap` | `0 credits` / `40 credit plan cap` |
| 11 | `components/student/StudentBilling.tsx:78` | `Recharges 10 hours on the 1st of each month.` (found in the 24-11-26 sweep; credit meaning) | `Recharges 10 credits on the 1st of each month.` |
| 12 | `components/student/StudentBilling.tsx:106` | `<th>Hours</th>` | `<th>Credits</th>` |
| 13 | `components/student/StudentBilling.tsx:110` | `data-label="Hours"` and `... {transaction.hours} hrs` | `data-label="Credits"` and `... {transaction.hours} credits` (singular for 1) |
| 14 | `components/student/StudentBilling.tsx:126` | `title="Add lesson hours"` and "Hours are added instantly" | `title="Add lesson credits"` and "Credits are added instantly" |
| 15 | `components/student/StudentBilling.tsx:135` | `{n} hours` (new balance) | `{n} credits` |
| 16 | `components/student/StudentLessons.tsx:270` | `{n} <em>hrs</em>` | `{n} <em>credits</em>` |
| 17 | `components/student/StudentOverview.tsx:145` | `{n} <em>hrs</em>` | `{n} <em>credits</em>` |
| 18 | `components/manager/PeopleForms.tsx:139` | `Starting credits (hours)` | `Starting credits` |
| 19 | `components/manager/PeopleForms.tsx:176` | `Current balance: {n} hours.` | `Current balance: {n} credits.` |
| 20 | `components/manager/PeopleForms.tsx:178` | `Add hours` / `Remove hours` options | `Add credits` / `Remove credits` |
| 21 | `components/manager/PeopleForms.tsx:179` | `<label>Hours<input ...` | `<label>Credits<input ...` |
| 22 | `components/manager/PeopleForms.tsx:181` | `New balance: {n} hours` | `New balance: {n} credits` |
| 23 | `lib/school/notifications.ts:65` | `has {n} hours left` | `has {n} credits left` |
| 24 | `lib/school/notifications.ts:121` | `{n} hours left. Top up to keep booking.` | `{n} credits left. Top up to keep booking.` |
| 25 | `lib/school/services/people.ts:313` | `Enter how many hours to add or remove.` | `Enter how many credits to add or remove.` |
| 26 | `lib/school/services/people.ts:316` | activity summary `${±n} hrs: reason` | `${±n} credits: reason` |
| 27 | `lib/data.ts:381-383` | package labels `5 / 10 / 20 lesson hours` | `5 / 10 / 20 lesson credits` (detail strings "N twenty-five-minute sessions" already correct); `hours` fields stay |
| 28 | `components/student/StudentBilling.tsx:58` | `Track your balance, renew lesson hours, and download billing history.` (missed by the 27-row sweep; found by the PVL grep; the API-mode sentence on the same line is already correct) | `... renew lesson credits ...` |

Plural helper rule: where a quantity can be exactly 1 (rows 5, 13, and the `data.ts` package labels never are 1), use "credit" for `=== 1`, else "credits"; implement inline per site (no new util unless two sites share the same expression, then a 3-line local helper in `common.ts` is allowed but not required).

Allowlist (genuine hours; NOT changed; the guard excludes exactly these): `teacher/TeacherLessons.tsx:337` (teaching hours metric) and `:476` (on-the-spot hours); `teacher/TeacherBookingSlots.tsx:145`; `teacher/TeacherOverview.tsx:80,147`; `teacher/TeacherAnalytics.tsx:80,178,186`; `teacher/TeacherProfile.tsx:143,170` (weekly goal hours); `admin/AdminSettings.tsx:80,81,89` (cancellation-window hours); `manager/ManagerPerformance.tsx:60` (on-the-spot hours); `student/StudentOverview.tsx:129` (countdown "Hours" unit); `student/StudentLessons.tsx:228,410` (cancellation-window hours); `student/StudentSettings.tsx:53` ("1 hour before" reminder); `components/NotificationPanel.tsx:12-14` (relative time); `lib/data.ts:218` ("Due in 5 hours" seed due label); all `lib/scheduling.ts` time math. Data-field and prop identifiers (`hours`, `creditHours`, `weeklyGoalHours`, `countdown.hours`, `transaction.hours`) are never part of the guard because it only inspects rendered string literals.

Guard (Step 4): `frontend/tests/credit-copy.test.ts` reads the credit-meaning source files (the rows above) as text, extracts quoted/JSX text segments, and fails on `/\bhrs?\b|\bhours?\b/i` in any credit-meaning file segment unless the file+segment is on an explicit in-test allowlist (keyed by file and a fixed substring, with a reason string). The test also asserts the allowlist entries still exist (so a stale allowlist fails). e2e selectors were checked: no spec in `frontend/e2e/**` matches "hrs", "credit hours", or "Hours remaining" (only data keys `hours:` in `e2e/api/uploads.spec.ts:94`, `e2e/support/api.ts:193`, `e2e/support/local-school.ts:207`), so no e2e spec edits are expected; EVL confirms by running the suite.

### C. 390px tab rows and material chip (measure first, then CSS only)

- Probe (scratchpad, NOT committed): a throwaway Playwright script that starts the demo-mode dev server through `frontend/e2e/serve.mjs` (`E2E_MODE=demo`, port 3100; one dev server per folder, so stop it after) and records `document.documentElement.scrollWidth` vs `clientWidth` at a 390px viewport on the five tab-row screens (Curriculum, student Lessons, Teacher Lessons, plus the two other tabbed screens identified in RESEARCH: PROGRESS.md item 5 lists Curriculum, Lessons, Teacher Lessons; add Manager Students and Teacher Students only if they are tabbed and overflow), and walks the ancestor chain of the widest element. Record before values in the phase report.
- Fix targets (CSS only, `frontend/app/globals.css`): `.student-tabbar` rule at line 223 (`overflow-x: auto` exists; the culprit is an ancestor or flex child lacking `min-width: 0`, to be confirmed by the probe), the `.lesson-material` rules at lines 363-371 and 1542-1547, and the 480px media query at line 371 (`.lesson-material .compact-button { margin-left: 50px }`) combined with `.lesson-material-files { padding-left: 50px }` at line 1543 (the 1554 override resets padding only inside its own media block). Reset `.lesson-material-files` padding-left and `.lesson-material .compact-button` margin-left at narrow widths so the Remove button aligns and the material name (`.lesson-material-file span`, ellipsis already at line 1546) shows its ellipsis.
- Pass: no horizontal page scroll (scrollWidth <= clientWidth) at 390px on every probed tab-row screen after the fix; Remove aligned with the chip; material name ellipsis visible; desktop (1280) layout unchanged by probe screenshot comparison. No new component.

### D. Frontend Vitest

- `frontend/vitest.config.ts`: environment `node`, `include: ["tests/**/*.test.ts"]`, alias `@` -> frontend root (mirrors tsconfig `paths`, `frontend/tsconfig.json:21`).
- `frontend/package.json`: devDependency `vitest` pinned to the version the root lockfile already resolves (3.2.7; backend declares `^3.0.5`); script `"test": "vitest run"`. Root `npm run test` is `npm run test --workspaces --if-present` (root `package.json:16`), so it picks up the new script automatically and the root `package.json` is NOT edited.
- Install: run `npm install` once at the repo root to add the devDependency and commit the updated `package-lock.json` in the same slice. Then verify `npm ci` succeeds locally (Phase 06 CI depends on it). `npm ci` deletes and reinstalls `node_modules`, so: stop all dev servers first, run it as the last install-touching action of Step 3, and rerun typecheck afterwards. If `npm ci` fails, fix the lockfile before moving on.
- Helper `frontend/tests/helpers/school.ts`: `freshSchool(now)` calls `configureSchoolStore(createMemoryAdapter(createSeedSchool(now)))` (exports at `lib/school/index.ts:8,11`, `seed.ts:78`, `adapter.ts:48`, `store.ts:192`) and returns the live snapshot accessors; tests call it in `beforeEach` (reconfigure per test, no shared state). Fake timers (`vi.useFakeTimers()` + `vi.setSystemTime(...)`) for any date-dependent rule (cancellation window via `hoursUntil`); `vi.spyOn(Math, "random")` where room codes are asserted. Mode flags: local branch is the default (`isDemoMode()` true unless `NEXT_PUBLIC_DEMO_MODE === "false"`), so tests run with the env unset; one test asserts the API branch is not taken. EXECUTE must confirm how the store initializes under the memory adapter (hydrate vs first read) and adjust the helper, not the app code. PVL probe result (24-11-26): importing `lib/school/index.ts`, `services/bookings.ts`, `services/library.ts` and `notifications.ts` under plain Node succeeds; `configureSchoolStore(createMemoryAdapter(createSeedSchool(now)))` then `getSchoolSnapshot()` loads the seed (27 lessons, 13 enrollments); Node provides `File` and `structuredClone`. Correction: `createSeedSchool` is NOT exported from `lib/school/index.ts` (it exports only `SEED_IDS`); the helper imports it from `@/app/lib/school/seed`. The helper must also call `configureSchoolDataSource("local")` in `freshSchool` so an inherited `NEXT_PUBLIC_*` env can never flip the store to API mode.
- Test files (~8 files, ~35-45 tests), each at the service boundary, no UI, no duplication of what e2e proves:
  1. `bookings.test.ts`: student cancel refunds when hours-until >= `studentLateCancellationHours` and not when late; non-scheduled cancel refused; rebook from the local branch gets the next plan and a fresh `ESL-####` room code (parity with the API rebook), debits exactly `LESSON_CREDIT_HOURS`; slot must be open.
  2. `approvals.test.ts`: cancellation/closure request approve + decline, refuses completed lessons, role guards.
  3. `credits.test.ts`: `changeCredits` overdraft refusal, purchase path, adjust path via `people.ts` (message wording from rows 25-26), balance selectors.
  4. `homework.test.ts`: assign, submit, review, re-review refused.
  5. `quality.test.ts`: rating rules (score bounds, parent source, one rating per lesson).
  6. `library.test.ts`: archived item cannot attach; cancelled-lesson attach refused; creator-or-admin edit/archive; attach idempotent; detach of a missing link a no-op; non-manager cannot attach. `createLibraryItem` happy path (FileReader + IndexedDB) = documented known gap.
  7. `permissions.test.ts`: `library.manage`, `library.edit`, `lesson.attachLibraryItem` per role (`permissions.ts:100-115`), including the manager team-scope rule.
  8. `uploads-validation.test.ts`: the shared validators from Step 2 (size cap at `MAX_UPLOAD_BYTES`, accepted MIME families, rejection message).
  9. `credit-copy.test.ts` (Step 4 guard) and, in Step 5, one `notifications.test.ts` case for `activityNotification`.
- Failing stubs for TDD (consumed by EXECUTE as red-first): each Fully-Automated scenario below starts as `test("...", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: ..."); })` then is made green.

### E. Carry-ins

- Notification navigation: `lib/school/notifications.ts` `navFor` (line 211) has no `library` family branch, so `library.created|updated|archived` falls through to "Overview". Add `if (family === "library") return role === "admin" || role === "manager" ? "Curriculum" : "Lessons";`. Library is a sub-tab of the "Curriculum" nav (`ManagerCurriculum.tsx:231-233`), not a nav id of its own; the sub-tab cannot be selected from the nav string (accepted, documented limit). `lesson.libraryAttached|libraryDetached` are already `lesson` family. `categoryOf` stays "plans" (no contract change). Unit test via exported `activityNotification` (`notifications.ts:240`).
- Shared upload validators: move `ACCEPTED` and a `validateUploadFile(file)` (size + MIME, same messages) next to `MAX_UPLOAD_BYTES` in `lib/school/files.ts:55`; `services/uploads.ts` (private `validate`, lines 8-14) and `services/library.ts` (private `validateFile`, lines 27-33) import it. Pure refactor, behavior and messages byte-identical; pinned by `uploads-validation.test.ts` written first.
- API-mode visual probe (scratchpad, not committed): needs local Postgres (migrated, seeded), backend on :4000, and Next in API mode on :3000 via `serve.mjs` env (`E2E_MODE=api`). Loads the Curriculum Library tab and the Materials dialog for each role at 390 and 1280, plus the Phase 03 P3-13 auth screens (password change card, admin reset modal) at 390. Pass: renders, no horizontal scroll, no console errors. Results (and any defect found) go in the phase report; a defect that is CSS-only and in the Step 6 files is fixed in place, anything else becomes a backlog note.
- Docs carried out to UPDATE PROCESS (not edited in this phase): `process/context/tests/all-tests.md` and `process/context/all-context.md` still say "no frontend unit runner" and carry old counts; update with the new runner, test counts, and smoke totals.

---

## Blast Radius (corrected 24-11-26)

Backend:
- `backend/src/routes/lessons.ts` (rebook handler only)
- `backend/scripts/smoke.ts` (`rebookScenario`; shared with Phase 06)

Frontend runner and deps:
- `frontend/package.json`, `frontend/vitest.config.ts` (new), `package-lock.json` (root, shared with Phase 06 CI `npm ci`)
- `frontend/tests/helpers/school.ts` and the ~9 `frontend/tests/*.test.ts` files (new)

Frontend source:
- `frontend/app/lib/school/files.ts`, `services/uploads.ts`, `services/library.ts` (validator refactor)
- `frontend/app/lib/school/notifications.ts` (nav + credits copy), `services/people.ts` (copy), `frontend/app/lib/data.ts` (package labels)
- `frontend/app/lib/school/services/bookings.ts` (local `rebookLesson`: one-line `live` refusal only)
- `frontend/app/globals.css` (390px, chip, Remove)
- Copy-only edits: `components/LuminaApp.tsx`, `components/manager/{ManagerSchedule,ManagerStudents,PeopleForms}.tsx`, `components/student/{StudentBilling,StudentLessons,StudentOverview}.tsx`

Not touched: root `package.json` (workspaces script already covers the new test script), `frontend/playwright.config.ts` and `playwright.demo.config.ts` (Phase 06), `backend/src/db/*` and migrations, `backend/tests/*`, e2e specs (unless EVL proves a copy selector break, then a minimal in-scope edit is allowed and logged), `frontend/app/lib/school/api/*`, `types.ts` (contract).

Shared with other phases: `package-lock.json` and `frontend/package.json` with Phase 06 (CI `npm ci`); `backend/scripts/smoke.ts` with Phase 06 (CI runs it) and 04 (library domain, append-only there); `StudentLessons.tsx` / `TeacherLessons.tsx` (CSS-only here for chips; Phase 04 owns the materials markup).

Risk class: medium. Rebook is a credits/booking path (high-risk class "billing/credits"), so it carries a Hybrid gate. No auth, schema, or secrets surface.

---

## Acceptance Criteria (SPEC-linked; criterion <-> gate bidirectional)

| ID | Criterion | proven by | strategy |
|---|---|---|---|
| AC-1 | Rebook of a completed, cancelled, or scheduled original returns 201 with a fresh room code differing from the original, `lessonPlanId` from `resolveLessonDefaults` (next plan, distinct from other active lessons' plans), `planAttachedBy` set, exactly one `-1` debit and one `lesson.booked` | `npm run smoke` rebook domain (G-SMOKE) | Hybrid |
| AC-2 | Rebook of a `live` original is 400 with no debit and no slot consumed; role/ownership 403s and the refusal at 0.5 credits are unchanged | G-SMOKE rebook domain | Hybrid |
| AC-3 | Local-branch rebook yields the next plan and a fresh room code and debits `LESSON_CREDIT_HOURS` (API/demo parity) | `frontend/tests/bookings.test.ts` (G-FE-UNIT) | Fully-Automated |
| AC-4 | No credit-meaning UI string says "hrs"/"hours"/"credit hours"; all rows of the string table render the new wording; genuine-hours allowlist unchanged | `frontend/tests/credit-copy.test.ts` (G-FE-UNIT) plus demo/API visual probe | Fully-Automated + Agent-Probe |
| AC-5 | Backend/API `hours` field, `SCHOOL_SCHEMA_VERSION` 3, bootstrap keys unchanged | `backend/tests/contract.test.ts` (G-BE) and `git status --porcelain -- backend/src/db` empty | Fully-Automated |
| AC-6 | At 390px no horizontal page scroll on the probed tab-row screens; Remove aligned; material name ellipsis visible; desktop unchanged | scratchpad Playwright measure probe before/after (G-390-PROBE) | Agent-Probe |
| AC-7 | `npm run test --workspace @lumina/frontend` runs the new suite green; root `npm run test` runs backend (7/61 unchanged) and frontend | G-FE-UNIT, G-BE | Fully-Automated |
| AC-8 | Library guards (archived attach, cancelled-lesson attach, creator-or-admin edit) and `library.manage` / `library.edit` / `lesson.attachLibraryItem` permissions asserted in isolation | `library.test.ts`, `permissions.test.ts` (G-FE-UNIT) | Fully-Automated |
| AC-9 | Shared upload validator used by both services with identical messages | `uploads-validation.test.ts` (G-FE-UNIT) + typecheck | Fully-Automated |
| AC-10 | Library activity notifications navigate to "Curriculum" (admin/manager) or "Lessons" (teacher/student) | `notifications.test.ts` case (G-FE-UNIT) | Fully-Automated |
| AC-11 | API-mode library screens (4 roles x 390/1280) and P3-13 auth screens at 390 render with no horizontal scroll and no console errors | scratchpad API visual probe (G-API-VISUAL) | Agent-Probe |
| AC-12 | `npm ci` succeeds with the updated lockfile | G-NPM-CI | Hybrid |
| AC-13 | Phases 01-04 surfaces stay green (collision, upload scope, auth, library); no schema change | G-SMOKE (all 16 domains), G-E2E, `git status --porcelain -- backend/src/db` | Hybrid |

Known gaps (named residuals, never PASS-able alone; each backed by a stub note): (1) `createLibraryItem` local happy path (FileReader/IndexedDB) has no unit test -> backlog stub to be written at UPDATE PROCESS (`frontend-library-create-item-unit-test`), gate for that behavior stays CONDITIONAL, covered meanwhile by `e2e/demo/regression.spec.ts` and `e2e/api/curriculum-library.spec.ts` (Fully-Automated/Hybrid, so the behavior itself is not vacuously green). (2) Nav string cannot select the Library sub-tab inside "Curriculum" (documented UX limit, backlog line in the phase report). (3) Optional API rebook e2e spec not added (smoke proves the contract).

---

## Implementation Checklist (step order = execution order; each step has its own gate, run before the next step)

### Step 1 — Rebook backend + smoke (Level-1 gate: G-SMOKE rebook, typecheck)
- [x] 1.1 Smoke first (TDD red): extend `rebookScenario` per Design A (enrollment for studentR/teacherA, scheduled-original asserts, top up 3, completed and cancelled originals via `insertLibraryLesson`, live original 400); run `npm run smoke` and see the new rebook checks fail against the old handler.
- [x] 1.2 Edit `backend/src/routes/lessons.ts` rebook handler: relax the status gate to reject only `live`; call `resolveLessonDefaults` inside the transaction after the balance check; insert with the defaults (`enrollmentId`, `lessonPlanId`, `planAttachedBy`, `planAttachedAt`, `roomCode`); keep title/focus from the original; add the null-enrollment/plan comment.
- [x] 1.3 Gate: `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend` (7 files / 61 tests unchanged), `npm run smoke` (16 domains, >= 656, rebook green, other domains still green).

### Step 2 — Shared upload validators (Level-1 gate: typecheck, lint)
- [x] 2.1 Add `ACCEPTED` + `validateUploadFile` to `frontend/app/lib/school/files.ts` next to `MAX_UPLOAD_BYTES`.
- [x] 2.2 Replace the private validators in `services/uploads.ts` and `services/library.ts` with the import (messages unchanged).
- [x] 2.3 Gate: `npm run typecheck`, `npm run lint`.
- [x] 2.4 Local rebook parity (PVL P2): in `services/bookings.ts` `rebookLesson` local branch, after `requireLesson`/`assertCan`, add `if (original.status === "live") throw new ServiceError("A lesson in progress cannot be rebooked.");` (no other change); asserted by `bookings.test.ts` (written red first in Step 3).

### Step 3 — Vitest harness + lockfile + unit tests (Level-1 gate: G-FE-UNIT, npm ci)
- [x] 3.1 Add `frontend/vitest.config.ts`, devDependency `vitest` 3.2.7 and `"test": "vitest run"` in `frontend/package.json`; run `npm install` at root once; confirm `package-lock.json` diff is limited to the vitest additions for the frontend workspace.
- [x] 3.2 Add `frontend/tests/helpers/school.ts` (`freshSchool`, fake timers, Math.random stub helper).
- [x] 3.3 Write the ~9 test files per Design D, TDD stub first, then green: bookings, approvals, credits, homework, quality, library, permissions, uploads-validation (credit-copy lands in Step 4, notifications case in Step 5).
- [x] 3.4 Gate: `npm run test --workspace @lumina/frontend` green; root `npm run test` runs both workspaces green; stop dev servers, run `npm ci`, confirm success, rerun `npm run typecheck` and `npm run lint`.

### Step 4 — Credit copy + guard (Level-1 gate: G-FE-UNIT credit-copy, typecheck, lint)
- [x] 4.1 Write `frontend/tests/credit-copy.test.ts` first (red against current strings), with the allowlist from Design B.
- [x] 4.2 Apply the 28 table rows exactly (copy only; no identifier renames); singular handling at rows 5 and 13.
- [x] 4.3 Gate: credit-copy green, `npm run test --workspace @lumina/frontend`, `npm run typecheck`, `npm run lint`; grep `frontend/e2e` for the old strings (expected none).

### Step 5 — Notification navigation (Level-1 gate: G-FE-UNIT notifications case)
- [x] 5.1 Add the `notifications.test.ts` case for `activityNotification` with `library.created|updated|archived` per role (red).
- [x] 5.2 Add the `library` branch to `navFor` in `frontend/app/lib/school/notifications.ts`.
- [x] 5.3 Gate: frontend unit suite, typecheck, lint.

### Step 6 — 390px probe, CSS fix, re-probe, API visual + P3-13 (Level-1 gate: probes)
- [x] 6.1 Write the throwaway measure probe in the scratchpad (not committed); start demo dev server via `serve.mjs`; record scrollWidth/clientWidth and the ancestor chain at 390 for the tab-row screens and the lesson-material chip; capture before screenshots.
- [x] 6.2 CSS-only fix in `frontend/app/globals.css` (tab row ancestor `min-width: 0`/overflow containment near `.student-tabbar` line 223; `.lesson-material-files` padding-left and `.lesson-material .compact-button` margin-left resets at narrow widths near lines 371 and 1543).
- [x] 6.3 Re-probe: pass criteria per Design C at 390 and a 1280 sanity screenshot; stop the dev server.
- [x] 6.4 API-mode visual probe (needs Postgres + backend :4000 + Next :3000 in API mode): library screens for each role at 390 and 1280, plus P3-13 password change card and admin reset modal at 390; record result; stop servers. If Postgres or the backend cannot run, record the probe as BLOCKED-environment in the report (not silently skipped) and keep AC-11 CONDITIONAL.
- [x] 6.5 Gate: `npm run typecheck`, `npm run lint`, `npm run e2e` demo half still green (CSS-only change).

### Step 7 — Full exit gates (Level-2, EVL reruns these via vc-tester)
- [x] 7.1 Run the Exit Gate block below in order; record counts.

---

## Exit Gate

```powershell
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend        # 7 files / 61 tests, unchanged
npm run test --workspace @lumina/frontend       # new suite, all green
npm run test                                    # root: both workspaces
npm run smoke                                   # 16 domains, >= 656 checks
npm run e2e                                     # 27 API + 4 demo (ports 3000/3100/4000 free)
git diff --check
git status --porcelain -- backend/src/db        # expect empty: no schema change, no migration
npm ci                                          # run last; stop all dev servers first
```

- All checklist items checked; regression check confirms Phases 01-04 surfaces (collision, upload scope, auth, library) stay green.
- Never run `db:reset`, `db:push`, or TRUNCATE as a gate; smoke only touches its own fixtures on the local DB.
- Phase report written to the report destination above.

---

## Blockers That Would Justify BLOCKED Status

- Phase 04 exit gate not passed (it is closed; no blocker today).
- `npm ci` cannot be made to pass with the updated lockfile.
- Copy changes break Playwright selectors and the minimal fix would widen scope (checked: none expected).
- Local Postgres unavailable for smoke/API e2e (Hybrid gates need it; record environment status honestly).

---

## Risk and Edge Cases

| Risk | Mitigation |
|---|---|
| Rebook inserts a plan already held by another active lesson (double plan) | `resolveLessonDefaults` counts reserved plans (scheduled/live with a plan) and row-locks the enrollment `.for("update")`; smoke asserts distinct plans across the active lessons |
| Rebook race: two rebooks on the same student | `lockStudentCredits` is already the first statement in the transaction; unchanged |
| Rebook from a cancelled original whose plan was freed | Defaults recompute from the enrollment, so the plan may equal the freed one; the smoke assertion is "non-null and distinct from other ACTIVE lessons", not "different from the cancelled original" |
| Null enrollment (no active enrollment for the teacher/student pair) | Same as `POST /lessons`: null enrollment/plan, fresh room code; documented; covered by a smoke case only if cheap (otherwise reported) |
| Fixture change (new studentR enrollment) shifts other smoke counts | studentR is used only in `rebookScenario`; full smoke is the proof |
| Vitest memory-adapter store init differs from browser init | Helper owns init; if app code needs a change to be testable, stop and flag (no app refactor in this phase) |
| `npm ci` wipes `node_modules` mid-session | Do it last in Step 3 with servers stopped; rerun typecheck after |
| Copy guard false positives on prose | Allowlist keyed by file + substring + reason; test also fails on stale allowlist entries |
| CSS change affects desktop or other tabbed screens | Measure before/after; 1280 sanity screenshot; demo e2e rerun |
| Dev server port clash (3000/3100/4000) during probes | One dev server per folder; stop before `npm run e2e` |

Risk Predictions (self-run, 5-persona summary, 24-11-26): Backend engineer: rebook is the only credit path touched; keep the transaction order and rely on existing locks. QA: the old gate (scheduled-only) must still hold for `live`; asserting distinct active plans, not specific plan ids, avoids brittle fixtures. Frontend: string edits are cheap but easy to miss; the guard is the safety net. DevOps: the lockfile is Phase 06's input, so `npm ci` must be proven now. Product: wording change is visible everywhere; singular/plural and the allowlist matter more than coverage of obscure screens.

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC runs once in the outer program loop).

- [x] 1. RESEARCH — done 24-11-26: rebook handler, credit-copy sweep, e2e selectors (none), 390px CSS, memory adapter and Vitest wiring inspected
- [x] 2. INNOVATE — done 24-11-26: Decision Summary locked (rebook any non-live, reviewed copy table + guard, measure-first CSS, frontend Vitest ~9 files, carry-ins)
- [x] 3. PLAN-SUPPLEMENT — done 24-11-26: locked design written into this plan; Inner Loop Refresh Note written; blast radius and registry corrected
- [x] 4. PVL — done 24-11-26 (Gate: PASS; 6 concerns fixed in plan as P1-P6 plus E1-E14); vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by)
- [x] 5. EXECUTE — done 24-11-26: Steps 1–7 implemented, every step gate and the full Exit Gate green (executor run; EVL re-run pending; review-decision.json pending a spawned vc-code-reviewer)
- [x] 6. EVL — done 25-11-26: independent vc-tester, all gates green first try (typecheck, lint, backend vitest 7/61, frontend vitest 10/54, root test, smoke 16 domains/705, e2e 27 API + 4 demo, git diff --check, backend/src/db clean, lockfile diff only the vitest line, npm ci + typecheck + frontend tests); Phase 01-04 regression covered by the same smoke/e2e runs; vc-code-reviewer approved (0 C/H/M), user decision approved; results.tsv rows 8-9
- [x] 7. UPDATE PROCESS — done 25-11-26: phase report written (phase-05-parity-polish-and-unit-tests_REPORT_23-11-26.md), backlog notes closed or updated, context docs and umbrella state updated, execution commit 5c1b4b9, process commit follows. Original scope: phase report written, backlog notes closed (`rebook-enrichment`, `credit-hours-wording`, `frontend-test-runner`, `frontend-library-service-unit-tests`, `library-polish-followups`), stale docs fixed (`tests/all-tests.md`, `all-context.md`), context & umbrella state updated, commits done

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

---

## Touchpoints

- `backend/src/routes/lessons.ts` (read: `backend/src/lib/lesson-defaults.ts`, `backend/src/routes/bookings.ts:226` for call shape), `backend/scripts/smoke.ts`
- `package-lock.json`, `frontend/package.json`, `frontend/vitest.config.ts`, `frontend/tests/**`
- `frontend/app/lib/school/{files,notifications}.ts`, `frontend/app/lib/school/services/{uploads,library,people}.ts`, `frontend/app/lib/data.ts`
- `frontend/app/globals.css`
- Copy-only components: `LuminaApp.tsx`, `manager/{ManagerSchedule,ManagerStudents,PeopleForms}.tsx`, `student/{StudentBilling,StudentLessons,StudentOverview}.tsx`
- Read-only references: `frontend/app/lib/school/{permissions,seed,store,adapter,index}.ts`, `frontend/e2e/serve.mjs`, `frontend/e2e/**` (selector audit)

---

## Public Contracts

- Backend/API JSON field `hours`, bootstrap collection/settings keys, and `SCHOOL_SCHEMA_VERSION` (3) stay unchanged; copy change is UI-only.
- `POST /lessons/:id/rebook`: request body `{date,time}` and the 201 response shape (lesson row) unchanged. Behavior change: any non-live original is accepted (completed/cancelled/scheduled; previously every non-scheduled original was 400, now only `live` is), the new lesson gets a fresh `roomCode` and the next `lessonPlanId` with `planAttachedBy`/`planAttachedAt`, and the booking debit/activity stay one `-1` and one `lesson.booked`.
- Notification `category` set unchanged (`plans` for library); only the `nav` target for `library.*` changes.
- No new env vars, no migration, no new API routes.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| G-SMOKE: `npm run smoke` rebook domain (scheduled/completed/cancelled originals, live 400, one debit, one activity, fresh code, next plan) and all 16 domains >= 656 checks | Hybrid (needs local Postgres + backend env) | AC-1, AC-2, AC-13 |
| G-BE: `npm run test --workspace @lumina/backend` (7 files / 61 tests) incl. `contract.test.ts` | Fully-Automated | AC-5, AC-7 |
| G-FE-UNIT: `npm run test --workspace @lumina/frontend` (bookings, approvals, credits, homework, quality, library, permissions, uploads-validation, credit-copy, notifications) | Fully-Automated | AC-3, AC-4, AC-7, AC-8, AC-9, AC-10 |
| G-E2E: `npm run e2e` (27 API + 4 demo; selector audit shows no copy dependency) | Hybrid (Postgres, ports 3000/3100/4000 free) | AC-13, AC-4 (no selector break) |
| G-390-PROBE: scratchpad Playwright measure/re-probe at 390 and 1280 on tab-row screens and lesson-material chips | Agent-Probe | AC-6 |
| G-API-VISUAL: scratchpad API-mode probe, library screens x 4 roles at 390/1280 + P3-13 auth screens at 390 | Agent-Probe | AC-11 |
| G-NPM-CI: `npm ci` after lockfile update, then typecheck | Hybrid (reinstalls node_modules) | AC-12 |
| G-STATIC: `npm run typecheck`, `npm run lint`, `git diff --check`, `git status --porcelain -- backend/src/db` empty | Fully-Automated | AC-5, AC-9, AC-13 |
| Residual: `createLibraryItem` local happy path (FileReader/IndexedDB) | Known gap (backlog stub; behavior covered by `e2e/demo/regression.spec.ts` and `e2e/api/curriculum-library.spec.ts`, so gate stays CONDITIONAL only for the unit layer) | AC-8 (unit layer) |

Validator commands for this artifact: `node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-05-parity-polish-and-unit-tests_PLAN_23-11-26.md`; `node .claude/skills/vc-generate-phase-program/scripts/validate-phase-stub.mjs <same path>`.

---

## Test Infra Improvement Notes

- New in this phase: frontend Vitest runner (node environment, memory adapter) closes `frontend-test-runner` for service-level rules. Not covered: component rendering and browser-only code (FileReader, IndexedDB); if component tests are wanted later they need `jsdom` plus Testing Library (separate backlog item).
- Smoke fixture gap: `rebookScenario` needs an enrollment for studentR; consider a shared "enrolled student" fixture helper if more domains need plan progression (note only).
- The 390px and API visual probes are scratchpad scripts, not committed; if they prove valuable, a committed Playwright visual spec is a separate backlog item (Phase 06 CI could run it).
- `e2e-startup-timeout-flake` is Phase 06's to resolve (CI pre-build or longer timeout).

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-05-parity-polish-and-unit-tests_PLAN_23-11-26.md`
- Last completed step: Step 7 UPDATE PROCESS (25-11-26). Phase 05 is VERIFIED; the inner loop is complete. Execution commit 5c1b4b9.
- Validate-contract status: written 24-11-26 (inner-pvl: phase-05, Gate: PASS)
- Supporting context files loaded: umbrella plan, Phase 06 plan, Phase 04 report, backlog notes (frontend-library-service-unit-tests, library-polish-followups, e2e-startup-timeout-flake, default-account-password, rebook-enrichment, credit-hours-wording, frontend-test-runner), `process/context/all-context.md`, `tests/all-tests.md`, `phase-blast-radius-registry.md`
- Next step for a fresh agent: none for this phase. Next is the separate default-account-password fix (its own RIPER-5 pass, RESEARCH first), then Phase 06 CI & Docker Compose. See the umbrella `## Current Execution State`.

---

## Inner Loop Refresh Note

## Inner Loop Refresh Note: 2026-11-24 — changed sections: Purpose, Locked Decisions (new), Out of Scope (new), Carried in from Phase 04, Design (new), Blast Radius, Implementation Checklist (re-ordered Steps 1–7 with per-step gates), Exit Gate, Acceptance Criteria (new), Risk and Edge Cases (new), Phase Loop Progress, Touchpoints, Public Contracts, Verification Evidence, Test Infra Improvement Notes, Resume and Execution Handoff. Invalidates prior validate-contract.

---

## Validate Contract

Status: PASS
Date: 24-11-26
date: 2026-11-24
generated-by: inner-pvl: phase-05

Parallel strategy: sequential
Rationale: 3/7 signals (S2 billing/credits path touched by the rebook handler, S6 high-risk class billing/credits, S7 5+ files; S1 not met: 2 workspaces, S3 no open design choices since decisions are locked, S4 not scored for an inner phase, S5 not requested). The score reads MEDIUM (parallel), but fit overrides it: the lockfile, `frontend/package.json`, the `npm ci` that wipes `node_modules`, one shared database and fixed ports (3000/3100/4000/4100) serialize the work, so parallel editors would collide and the gates cannot run concurrently. One opus `vc-execute-agent`, steps in the planned order.
V2 note: the Layer 1 (4 dimensions) and Layer 2 (Sections A rebook + smoke, B copy table + guard, C 390px CSS, D Vitest harness + lockfile, E carry-ins) passes were run in-session and sequentially by the validate agent (a fire-and-forget subagent cannot spawn more agents, and a previous validate run stalled). Evidence read from source: `backend/src/routes/lessons.ts` (rebook 533-581, POST /lessons 295-330, complete 630-660), `routes/bookings.ts` (206-240), `routes/requests.ts` (205-262), `lib/lesson-defaults.ts`, `scripts/smoke.ts` (setup 395-448, `nextSlot`/`scheduleLesson`/`addCredits`, `rebookScenario` 539-555, `insertLibraryLesson` 1307-1322), `frontend/app/lib/school/{store,adapter,index,notifications,permissions,files}.ts`, `services/{bookings,uploads,library,common}.ts`, `auth/mode.ts`, `lib/data.ts` nav arrays, all 27 copy-table lines, `globals.css` (223, 363-371, 1538-1558), `frontend/{package.json,tsconfig.json,eslint.config.mjs}`, `backend/vitest.config.ts`, `package-lock.json` (vitest 3.2.7, linux optional entries), `e2e/serve.mjs`, `frontend/e2e/**` (selector grep: none). Empirical probe (read-only, scratchpad): a plain-Node `tsx` import of `lib/school/index.ts`, `services/bookings.ts`, `services/library.ts` and `notifications.ts` succeeds, and `configureSchoolStore(createMemoryAdapter(createSeedSchool(now)))` loads the seed (27 lessons, 13 enrollments). Environment: the Postgres service is running and ports 3000/3100/4000/4100 are free, so the Hybrid gates and the API visual probe are runnable.
V4 menu choices recorded (interactive session, recommended option taken for each): net gate PASS (after the plan fixes below); strategy sequential (1 opus executor); cost guard not triggered; test gates as tabled below; high-risk pack required for the rebook path (billing/credits); V5 = "Accept" (no /goal print: BRANCH B, the umbrella `## Stable Program Goal` governs, so no goal block is written to this phase plan).

### Strategy options for EXECUTE (7-signal score 3/7)

| Strategy | Agent count | Model | Cost guard | Fit |
|---|---|---|---|---|
| Sequential (recommended) | 1 executor | opus | none | Shared lockfile, `node_modules`, DB and ports; steps depend on each other (smoke red, handler, shared validator, harness, guard, copy, CSS) |
| Parallel subagents | 2 editors (backend+smoke, frontend) + 1 tester = 3 | 2 opus + 1 sonnet | none | Halves are independent, but gates and `npm ci` serialize; low payoff and lockfile risk |
| Workflow | 7 steps x 1 agent x 1 pass = 7 (+ fix iterations) | opus for code steps | none | Overkill, item count known |
| Agent team | 3 members (backend opus, frontend opus, reviewer sonnet) x 2 rounds = 6 | mixed | none (3 <= 6) | Only if the user wants live review of the rebook lock order; named teammates with TeamCreate + shared task list + SendMessage, not bare parallel subagents |

Phase end: EVL must be a spawned `vc-tester` (sonnet) re-running the gate commands below; never run by the orchestrator in its own shell. The high-risk review decision is a spawned `vc-code-reviewer` (sonnet).

### Plan updates applied (24-11-26)

- [x] P1: The 27-row copy table missed `StudentBilling.tsx:58` ("renew lesson hours", credit meaning). Added as row 28 (`renew lesson credits`); Step 4.2 now says 28 rows; the table intro tells EXECUTE what to do if the red-first guard flags anything else (fix and log it, or allowlist genuine hours with a reason).
- [x] P2: Local-branch parity gap. `services/bookings.ts` `rebookLesson` (local) has NO original-status gate, so it would rebook a `live` lesson that the API now rejects, contradicting Locked Decision 1. Added Step 2.4 (one-line `live` refusal), added `services/bookings.ts` to the Blast Radius and to `phase-blast-radius-registry.md`, and updated the Out of Scope row. Enrichment code stays unchanged.
- [x] P3: Harness correction. `createSeedSchool` is not exported from `lib/school/index.ts` (only `SEED_IDS` is); the helper imports it from `@/app/lib/school/seed`, and `freshSchool` also calls `configureSchoolDataSource("local")` so an inherited `NEXT_PUBLIC_*` env cannot flip the store to API mode. The Node import probe result is recorded in the plan.
- [x] P4: Status text updated (header, Phase Loop Progress step 4 ticked, Resume handoff points at the contract and EXECUTE).
- [x] P5 (execute instructions): smoke fixture hygiene, probe tooling, `npm ci` ordering and lockfile review (E2, E6, E10).
- [x] P6 (execute instruction): a backend left running on :4000 after the API probe would be reused by Playwright with the default auth limit and cause 429s (E10).

### Execute-agent instructions

- E1 Order and gates: run the Implementation Checklist Steps 1 to 7 in order and run each step's gate before the next. Gates run one at a time, never in parallel (shared DB, ports, `node_modules`). No dev server or Playwright process may run during `npm install` / `npm ci`.
- E2 Step 1 smoke (red first). In `rebookScenario` create the studentR enrollment into a LOCAL variable (for example `rebookEnrollmentId`), never the module-level `enrollmentId` that `lessonsScenario` asserts for studentA (line 502). Create it BEFORE scheduling the original so the original gets plan index 0. Keep every existing assertion verbatim. Added assertions: the new lesson's `roomCode` matches `/^ESL-\d{4}$/` and differs from the original's (about 1 in 9000 chance of a random collision; on a failure rerun once before treating it as a defect, and say so in the report), `lessonPlanId` is a non-null string different from the original's, `planAttachedBy` non-null, `enrollmentId` equals the new enrollment. Completed and cancelled originals come from `insertLibraryLesson("teacherA","studentR", status)` (it uses `nextSlot(9)`, no enrollment, no plan, no debit); a live original rebook is 400 with unchanged balance and the target slot still open. Assert "distinct from every other ACTIVE studentR lesson's plan" by reading studentR's lessons (admin `GET /lessons` or bootstrap) and comparing `lessonPlanId` among status scheduled/live only. Use `addCredits("studentR", 3)` after the 0.5 refusal (balance 3.5), then assert -1 per successful rebook. Expect 16 domains and a total above 656.
- E3 Step 1 handler (`backend/src/routes/lessons.ts`, rebook only). Replace the `!== "scheduled"` gate with a `live`-only refusal (400 `badRequest`), keep the ownership checks above it exactly as they are, and inside the existing transaction keep this order: `lockStudentCredits` -> slot lookup -> `getCreditBalance` -> `resolveLessonDefaults(tx, { teacherId: original.teacherId, studentId: original.studentId, actorId: request.user.sub })` -> insert -> slot delete -> `-1` debit -> `logActivity`. Do not move `resolveLessonDefaults` before the balance check or the lock (the enrollment `FOR UPDATE` must stay the second lock after the student advisory lock, the same order as `POST /lessons` and `POST /bookings`). Keep `title`/`focus` from the original, leave the `isActiveLessonSlotConflict` -> 409 catch untouched, add the null-enrollment/plan code comment. Do not touch `lib/lesson-defaults.ts`.
- E4 Step 2.4 (local parity, P2): add only the `live` refusal in the local `rebookLesson`; do not change `createLesson`/`changeCredits` use. `bookings.test.ts` covers it (red first).
- E5 Vitest harness. `frontend/vitest.config.ts`: `environment: "node"`, `include: ["tests/**/*.test.ts"]`, alias `@` resolved with `fileURLToPath(new URL("./", import.meta.url))` (do not rely on `__dirname`). `frontend/package.json`: devDependency `"vitest": "3.2.7"` (exact; the backend range `^3.0.5` already resolves to 3.2.7, so there stays one hoisted copy) and `"test": "vitest run"`. `frontend/tsconfig.json` includes `**/*.ts`, so `npm run typecheck` type-checks `vitest.config.ts` and every file under `tests/`, and ESLint (`next` core-web-vitals + typescript) lints them: keep them strictly typed and lint-clean; use `fileURLToPath(new URL(..., import.meta.url))` for any file path in tests.
- E6 Lockfile and `npm ci`. After `npm install` at the root, run `git diff --stat package-lock.json` and read the diff: it must be limited to the `frontend` workspace devDependency for vitest (plus trivial metadata). If it churns broadly or removes any `@rollup/rollup-linux-*` / `@esbuild/linux-*` optional entries (needed by Linux CI in Phase 06), revert the lockfile and redo the install with the same npm that produced the current file. Then, with NO node process running (check ports 3000/3100/4000/4100 and stray `node`/`next` processes), run `npm ci` once at Step 3.4, then rerun `npm run typecheck`, `npm run lint` and the frontend unit suite. On Windows, if `npm ci` fails with EBUSY/EPERM, find and stop the process holding the file and rerun; never leave `node_modules` half-installed (recover with `npm ci` again, not by editing the lockfile).
- E7 Store tests: `freshSchool(now)` = `configureSchoolDataSource("local")` + `configureSchoolStore(createMemoryAdapter(createSeedSchool(now)))`, called in `beforeEach`. Fake timers only where a rule reads the clock (`vi.useFakeTimers()` fakes `Date` and timers, not `structuredClone`; always `vi.useRealTimers()` in `afterEach`). `vi.spyOn(Math, "random")` for room-code assertions, restored in `afterEach`. If app code needs a change to be testable, STOP and report NEEDS_CONTEXT (no app refactor in this phase). The `createLibraryItem` happy path stays a documented gap (FileReader/IndexedDB).
- E8 Copy guard: key the allowlist by file path + a fixed substring + a reason, never by line number; extract string and JSX text segments and strip `${...}` interpolations and JSX `{...}` expressions before matching `/\bhrs?\b|\bhours?\b/i`, so identifiers such as `transaction.hours` or `creditHours` never trigger it; assert every allowlist entry still matches (a stale entry fails). The guarded file set is the table's files plus `lib/school/notifications.ts`, `services/people.ts`, `lib/data.ts` (package labels; the genuine "Due in 5 hours" seed label at `lib/data.ts:218` needs a substring allowlist entry). Files that mix credit and genuine hours (`StudentLessons.tsx:228,410`, `StudentOverview.tsx:129`) need allowlist entries; files that are only genuine hours stay outside the guarded set. Write it red first, then apply the 28 rows. Singular "1 credit" when the quantity is exactly 1 (rows 5, 13). Re-grep `frontend/e2e` for the old strings afterwards (the PVL grep found none).
- E9 Shared upload validator: add `ACCEPTED` and `validateUploadFile(file)` next to `MAX_UPLOAD_BYTES` in `files.ts` and import it from `services/uploads.ts` and `services/library.ts`; messages byte-identical. Write `uploads-validation.test.ts` first against the current private behavior (build `File` objects; set the size with a sized Blob or `Object.defineProperty`), then refactor.
- E10 Probes (scratchpad, not committed). (a) The probe script lives in the scratchpad, so resolve Playwright through `createRequire` from `frontend/package.json` (a bare import fails from outside the repo). (b) 390px probe: start the demo dev server only through `frontend/e2e/serve.mjs` (`E2E_MODE=demo`, port 3100); measure `scrollWidth` vs `clientWidth` at 390 and 1280 on EVERY screen that uses `.student-tabbar` (five: `StudentLessons`, `TeacherLessons`, `TeacherAnalytics`, `ManagerCurriculum`, `AdminSettings`) plus the lesson-material chip; record before values; fix in `globals.css` only; re-measure; then stop the server and confirm :3100 is free (one dev server per folder; a leftover blocks `npm run e2e:demo`). (c) API visual probe (Postgres is running; needs the backend on :4000 and Next in API mode on :3000 via `serve.mjs` `E2E_MODE=api`): start the backend with `RATE_LIMIT_MAX=100000` and `AUTH_RATE_LIMIT_MAX=100000`; VIEW ONLY (log in as the seeded accounts, open the Library tab, Materials dialog, `PasswordChangeCard`, admin `ResetPasswordModal`; never submit a form, change a password or write data); record console errors; then stop BOTH servers before `npm run e2e` (Playwright reuses a backend already on :4000, and a leftover default-limit backend returns 429 on auth). If anything cannot run, record BLOCKED-environment in the report and keep AC-11 CONDITIONAL; never skip silently.
- E11 Notification nav: add the `library` branch to `navFor` (admin/manager -> "Curriculum", teacher/student -> "Lessons"); both labels exist in `managerNavItems`/`adminNavItems` and `teacherNavItems`/`studentNavItems` (`lib/data.ts`). `categoryOf` stays "plans". Unit test through the exported `activityNotification`.
- E12 High-risk pack (rebook = billing/credits): produce the 5 artifacts in `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/harness/phase-05-rebook/` (risk-gate; context-snippets with file:line citations of the rebook handler and `resolveLessonDefaults`; verification covering the happy path plus the live refusal, the refusal at 0.5 credits and the cancelled-original case; review-decision; adversarial-validation covering double-rebook race, lock order, rebooking a refunded cancelled lesson charges once, slot collision 409, ownership bypass), run `node .claude/skills/vc-risk-evidence-pack/scripts/validate-risk-artifacts.mjs process/features/launch-readiness/active/lumina-v1-finish_23-11-26/harness/phase-05-rebook`, and record the reviewer decision (spawned `vc-code-reviewer`) before calling the phase ready.
- E13 Exit gate order (EVL repeats it via a spawned `vc-tester`): `npm run typecheck`; `npm run lint`; `npm run test --workspace @lumina/backend` (7 files / 61 tests); `npm run test --workspace @lumina/frontend`; `npm run test` (root); `npm run smoke` (16 domains, >= 656, port 4100 free); `npm run e2e` (27 API + 4 demo; ports 3000/3100/4000 free, no probe server alive); `git diff --check`; `git status --porcelain -- backend/src/db` (empty); LAST `npm ci` with every server stopped, then `npm run typecheck` and `npm run test --workspace @lumina/frontend` once to prove the reinstall. One e2e webServer startup-timeout rerun is allowed (deferred flake, Phase 06); a second is recorded, not fixed. `playwright.config.ts` stays untouched. Never `db:reset`, `db:push`, TRUNCATE.
- E14 Closeout and commits: update docs only at UPDATE PROCESS (`tests/all-tests.md` and `all-context.md` runner/count statements, smoke totals, the backlog stub `frontend-library-create-item-unit-test`, closing the 5 named backlog notes, umbrella `## Current Execution State`); execution commit separate from the process/context commit, both on `developing`; commit only on explicit user request. Default-account-password is NOT part of this phase.

### Test gates (run after each step; regression suite at Step 7)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | Rebook of a completed, cancelled or scheduled original: 201, fresh room code, next plan distinct among active lessons, `planAttachedBy` set, enrollment set, exactly one `-1` debit and one `lesson.booked` | Hybrid | `npm run smoke` (`rebook` domain) — precondition: local Postgres + `backend/.env`, port 4100 free | B |
| AC-2 | Rebook of a `live` original: 400, no debit, slot not consumed; 403 for another student and refusal at 0.5 credits unchanged | Hybrid | `npm run smoke` (`rebook` domain) | B |
| AC-3 | Local-branch rebook: next plan, fresh `ESL-####` room code, debit exactly `LESSON_CREDIT_HOURS`, slot must be open, `live` original refused (parity) | Fully-Automated | `npm run test --workspace @lumina/frontend` (`tests/bookings.test.ts`) | B |
| AC-4 | No credit-meaning UI string says "hrs"/"hours"/"credit hours" (28 rows applied, genuine-hours allowlist intact and not stale); new wording visible | Fully-Automated + Agent-Probe | `npm run test --workspace @lumina/frontend` (`tests/credit-copy.test.ts`); demo/API visual probe | B |
| AC-5 | `hours` field, `SCHOOL_SCHEMA_VERSION` 3 and bootstrap keys unchanged; no schema change | Fully-Automated | `npm run test --workspace @lumina/backend` (`contract.test.ts`); `git status --porcelain -- backend/src/db` empty | A |
| AC-6 | 390px: no horizontal page scroll on the five `.student-tabbar` screens, Remove aligned, material name ellipsis visible, desktop unchanged | Agent-Probe | scratchpad Playwright measure before/after at 390 and 1280 | D |
| AC-7 | Frontend suite runs green in isolation and via root `npm run test`; backend stays 7/61 | Fully-Automated | `npm run test --workspace @lumina/frontend`; `npm run test` | B |
| AC-8 | Library guards (archived attach, cancelled-lesson attach, creator-or-admin edit/archive, idempotent attach, no-op detach) and `library.manage`/`library.edit`/`lesson.attachLibraryItem` per role incl. manager team scope | Fully-Automated | `tests/library.test.ts`, `tests/permissions.test.ts` | B |
| AC-9 | One shared upload validator used by both services, identical messages and 5 MB / MIME rules | Fully-Automated | `tests/uploads-validation.test.ts` + `npm run typecheck` | B |
| AC-10 | `library.created`, `library.updated`, `library.archived` notifications navigate to "Curriculum" (admin/manager) or "Lessons" (teacher/student) | Fully-Automated | `tests/notifications.test.ts` | B |
| AC-11 | API-mode library screens (4 roles x 390/1280) and P3-13 auth screens at 390 render with no horizontal scroll and no console errors | Agent-Probe | scratchpad API visual probe (view only) | D |
| AC-12 | `npm ci` succeeds with the updated lockfile; Linux optional entries preserved | Hybrid | `npm ci` (last, all servers stopped) then `npm run typecheck` + frontend suite — precondition: no running node processes | A |
| AC-13 | Phases 01-04 surfaces stay green (collision, upload scope, auth, library); no schema change | Hybrid | `npm run smoke` (all 16 domains, >= 656) + `npm run e2e` (27 API + 4 demo) + `git status --porcelain -- backend/src/db` | A |

Failing stubs (Fully-Automated rows; red-first starting points, not on-disk files):

```
// AC-3
test("should rebook locally with the next plan, a fresh ESL room code, one credit debit, and refuse a live original", () => { throw new Error("NOT IMPLEMENTED — TDD stub: local rebook parity") })
// AC-4
test("should find no hrs/hours/credit-hours wording in credit-meaning strings outside the allowlist", () => { throw new Error("NOT IMPLEMENTED — TDD stub: credit copy guard") })
// AC-8
test("should enforce library service guards and library permissions per role", () => { throw new Error("NOT IMPLEMENTED — TDD stub: library guards + permissions") })
// AC-9
test("should validate size and MIME identically for plan uploads and library uploads", () => { throw new Error("NOT IMPLEMENTED — TDD stub: shared upload validator") })
// AC-10
test("should navigate library activity notifications to Curriculum for staff and Lessons for teacher and student", () => { throw new Error("NOT IMPLEMENTED — TDD stub: library notification nav") })
// AC-5 and AC-7 are command-only (no stub)
```

Legacy line form (retained for existing consumers):
- Rebook API: [hybrid: `npm run smoke` `rebook` domain + local Postgres + backend env file, port 4100 free]
- Frontend service rules, copy guard, validator, notification nav: [Fully-automated: `npm run test --workspace @lumina/frontend`]
- Contract: [Fully-automated: `npm run test --workspace @lumina/backend`] | [Fully-automated: `git status --porcelain -- backend/src/db` empty]
- Static: [Fully-automated: `npm run typecheck`] | [Fully-automated: `npm run lint`] | [Fully-automated: `git diff --check`]
- Regression: [hybrid: `npm run smoke` 16 domains >= 656] | [hybrid: `npm run e2e` 27 API + 4 demo, ports 3000/3100/4000 free]
- Lockfile: [hybrid: `npm ci` last, no node processes, then typecheck + frontend suite]
- Mobile CSS and API screens: [agent-probe: scratchpad Playwright at 390/1280, view only]
- `createLibraryItem` local happy path (unit layer): [known-gap: documented as NEW PLAN REQUIRED — backlog stub `frontend-library-create-item-unit-test`, written at UPDATE PROCESS; the behavior itself is covered by `e2e/demo/regression.spec.ts` and `e2e/api/curriculum-library.spec.ts`]

Never a gate: `npm run db:reset`, `db:push`, TRUNCATE (destructive).

**Regression suite (after all steps):** the E13 order above. Plan-structure checks after closeout edits: `node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs <this plan>` and `node .claude/skills/vc-generate-phase-program/scripts/validate-phase-stub.mjs <this plan>` (0 failures before and after this contract).

### High-risk pack

Class: billing/credits (the rebook handler debits and creates a lesson). Minimum tier Hybrid, met by smoke (`rebook` domain), plus the Fully-Automated local-branch unit test. No Known-Gap accepted for the rebook behavior. Evidence pack required at `harness/phase-05-rebook/` per E12 (5 artifacts, validator command in E12, reviewer decision before the phase is called ready); not yet produced, EXECUTE owns it.

Rebook risk notes verified at PVL: (1) Lock order is `lockStudentCredits` (advisory, first) then the enrollment `FOR UPDATE` inside `resolveLessonDefaults`, identical to `POST /lessons` (`lessons.ts:302-312`) and `POST /bookings` (`bookings.ts:206-226`). The only other enrollment writer, lesson completion (`lessons.ts:644-651`), takes no student lock, and the cancel/approve paths take the student lock before touching the lesson row, so no lock cycle exists. (2) A cancelled original whose booking debit was refunded: the new lesson gets its own `-1` debit tied to the new lesson id, so the credit is charged exactly once for the new lesson. (3) Two concurrent rebooks by one student serialize on `lockStudentCredits`; different students on one slot both reach the insert and the loser gets 409 from `lessons_active_teacher_date_time_uidx` through the unchanged `isActiveLessonSlotConflict` catch. (4) Ownership checks (student own lesson, manager `managerOwnsStudent`, admin any; teachers are excluded by `requireRole`) run before the status gate and are untouched. (5) The status read happens before the transaction (pre-existing pattern); a lesson that turns `live` between the read and the insert could still be rebooked: accepted, low impact, to be noted in the report.

### Backlog artifacts

| Artifact | Location | What it tracks |
|---|---|---|
| `frontend-library-create-item-unit-test_NOTE_[dd-mm-yy].md` (write at UPDATE PROCESS) | `process/features/launch-readiness/backlog/` | Unit test for local `createLibraryItem` (FileReader + IndexedDB) needing jsdom or injected seams |
| existing notes to CLOSE at UPDATE PROCESS | `process/features/backend-cutover/backlog/` and `process/features/launch-readiness/backlog/` | `rebook-enrichment`, `credit-hours-wording`, `frontend-test-runner`, `frontend-library-service-unit-tests`, `library-polish-followups` |
| existing notes left OPEN | `process/features/launch-readiness/backlog/` | `default-account-password` (separate fix after Phase 05), `e2e-startup-timeout-flake` (Phase 06) |

### Dimension findings

- Infra fit: PASS — every referenced path and anchor exists (rebook 533-581, `lesson-defaults.ts` 29-90, smoke 539-555 and 1307, all 27 copy lines, `globals.css` 223/363-371/1538-1558, nav arrays); Node ships `File` and `structuredClone`; the Postgres service is running and ports 3000/3100/4000/4100 are free; the `createSeedSchool` import path was corrected (P3). The 390px probe tooling needs `createRequire` for Playwright (E10).
- Test coverage: PASS — after the fixes every developed behavior has a Fully-Automated or Hybrid proving gate (rebook: smoke + local unit test; copy: guard; validator: unit test; nav: unit test; lockfile: `npm ci`); CSS and API-mode screens are Agent-Probe by nature and runnable here; only the `createLibraryItem` unit layer is a named residual and it is covered at the behavior level by two e2e specs, so no behavior rests on Known-Gap alone (vacuous-green check passed). The copy-table miss (P1) and the local `live` gap (P2) are fixed.
- Breaking changes: PASS — API request/response shapes, the `hours` field, bootstrap keys and `SCHOOL_SCHEMA_VERSION` 3 are unchanged; `POST /lessons/:id/rebook` widens accepted originals (any non-live) and changes the new lesson's `roomCode`/plan, both intended and recorded under Public Contracts; no e2e spec depends on the changed copy (grep of `frontend/e2e/**` found none); no migration, `backend/src/db` untouched.
- Security surface: PASS — STRIDE: spoofing and elevation n/a (ownership and role checks unchanged and run before the status gate); tampering (slot claim, debit and insert stay in one transaction under the per-student advisory lock; the unique active-slot index still maps to 409); repudiation (`lesson.booked` activity row per rebook in the same transaction); information disclosure and denial of service n/a. Residual: the status check precedes the transaction (accepted). High-risk pack required (E12).
- Section A feasibility (rebook + smoke): PASS — handler edit is mechanical (gate line and insert values are uniquely matchable); the `resolveLessonDefaults` call shape matches `lessons.ts:308` and `bookings.ts:226`; the smoke additions fit the existing helpers (`openSlot`, `addCredits`, `insertLibraryLesson`, unique `nextSlot`); studentR is used only in `rebookScenario` and no other domain counts enrollments or bootstrap rows, so fixtures elsewhere do not shift; highest-risk edit: the smoke enrollment variable shadowing the module-level `enrollmentId` and the 1/9000 random room-code equality (E2).
- Section B feasibility (copy table + guard): PASS (after P1) — all 27 old strings found at the stated lines; row 28 added; the guard needs interpolation stripping and a file + substring allowlist (E8); highest-risk edit: files that mix credit and genuine hours (`StudentLessons.tsx`, `StudentOverview.tsx`).
- Section C feasibility (390px CSS): PASS — `.student-tabbar` (line 223, `overflow-x:auto` already) is used by five screens, not three (E10); `.lesson-material .compact-button { margin-left: 50px }` at 371 versus the 620px reset of `.lesson-material-files` at 1554 explains the Remove misalignment; a CSS-only fix is feasible; highest-risk edit: any rule touching the shared `.student-tabbar` containers, mitigated by the five-screen before/after measure and the demo e2e rerun.
- Section D feasibility (Vitest harness + lockfile): PASS — the store is Node-ready under the memory adapter (the import probe succeeded; `window` is absent and `adapterIsBrowserDefault` is false); `vitest` 3.2.7 is already hoisted from the backend, so the lockfile change is one workspace line; `tests/**` and `vitest.config.ts` fall inside the frontend `tsc`/ESLint scope (E5); Linux CI is safe provided the linux optional entries stay in the lockfile (E6); highest-risk edit: `npm ci` wiping `node_modules` (E6, E13).
- Section E feasibility (carry-ins): PASS — `navFor` has no `library` branch today (falls through to "Overview"); target nav labels exist for all four roles; the validators in `uploads.ts` and `library.ts` are identical (`ACCEPTED` regex, `validate`/`validateFile`), so the extraction is a pure move; the API visual probe is runnable but must be view-only and must not leave a default-limit backend on :4000 (E10).

Open gaps: none unresolved. Deferred (not counted as CONCERN/FAIL):
- `createLibraryItem` local happy path has no unit test (FileReader/IndexedDB): known-gap: documented as NEW PLAN REQUIRED — see backlog stub `frontend-library-create-item-unit-test` (written at UPDATE PROCESS; covered meanwhile by `e2e/demo/regression.spec.ts` and `e2e/api/curriculum-library.spec.ts`)
- The notification nav string cannot select the Library sub-tab inside "Curriculum": documented UX limit, recorded in the phase report
- Optional API rebook e2e spec not added (smoke proves the contract): documented decision, not a gap in proof
- `default-account-password` (HIGH) and the e2e startup-timeout flake: known-gap: documented as NEW PLAN REQUIRED — see `process/features/launch-readiness/backlog/default-account-password_NOTE_24-11-26.md` and `process/features/launch-readiness/backlog/e2e-startup-timeout-flake_NOTE_24-11-26.md`

### What This Coverage Does NOT Prove

- Smoke `rebook` domain (AC-1, AC-2): proves the contract against local Postgres with the auth limiter at the 100000 override; not browser behavior, not concurrent rebooks (no new race is asserted; the lock order and the unique-index 409 are argued from source and from the existing concurrency specs), not a null-enrollment rebook unless added cheaply (otherwise reported), not production data volume.
- Local unit tests (AC-3, AC-8, AC-9, AC-10): prove service-layer rules over the in-memory adapter in Node; not rendering, not FileReader/IndexedDB (`createLibraryItem` happy path), not the API branch of any service.
- Copy guard (AC-4): proves no un-allowlisted hours wording in the guarded files' string segments; not wording in files outside the guarded set, not tone or singular/plural correctness beyond rows 5 and 13, and not that screens actually render the text (the visual probe covers a sample).
- Contract test and `git status` (AC-5): prove key lists, version and absence of DB-file changes, not API runtime behavior.
- 390px and API visual probes (AC-6, AC-11): judgment of layout at two viewports on sampled screens, scratchpad only and not committed, so they do not regress-guard future CSS changes; AC-11 is view-only and does not exercise submit paths.
- `npm ci` (AC-12): proves a clean install on this Windows machine with this npm; not that the Linux CI runner installs identically (Phase 06 proves that).
- Regression (AC-13): Phases 01-04 surfaces are re-proven by the existing 16 smoke domains and 31 e2e tests; one webServer startup-timeout rerun is tolerated and recorded.

Gate: PASS
Accepted by: not required (Gate is PASS; all 4 Layer 1 dimensions and 5 sections PASS after the P1-P4 plan fixes; no unresolved concerns; residual gaps above are named known-gaps with backlog notes, not CONCERNs)
