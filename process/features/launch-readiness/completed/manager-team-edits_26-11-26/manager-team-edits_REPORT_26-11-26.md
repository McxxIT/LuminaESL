---
name: report:manager-team-edits
description: "EXECUTE + EVL report: managers rename and pause/reactivate own-team teachers/students through PATCH /users/:id; admin email changes end sessions (active) or re-invite (invited); transactional PATCH; frontend manager edit path"
date: 26-11-26
metadata:
  node_type: memory
  type: report
  feature: launch-readiness
  phase: pre-06
---

# Manager Team Edits — Execution Report

Date: 26-11-26
**Plan:** `process/features/launch-readiness/completed/manager-team-edits_26-11-26/manager-team-edits_PLAN_26-11-26.md`
**Feature:** launch-readiness (standalone pre-Phase-06 fix)
**Branch:** `developing`
**Status:** CODE DONE + EVL VERIFIED, review APPROVE WITH CONCERNS, review follow-up N1 + N2 **fixed 26-11-26**, committed (`68c9c30`, `fe0cc49`, `5ee5f9f`) and **archived** to `process/features/launch-readiness/completed/manager-team-edits_26-11-26/`

TL;DR: `PATCH /users/:id` is now one transaction with the target row locked. A manager can rename and pause/reactivate their own team's teachers and students; email, avatar color, archive and other teams stay admin-only and the deny is indistinguishable for unknown, foreign, admin, manager and non-teacher/student targets. An admin email change revokes the active person's sessions or re-issues the invitation to an invited person (old link dead at commit). The frontend manager path works end to end, the Email field is locked with an admin-only note, and the admin sees the new invitation. No schema change, no dependency change, no real mail.

---

## 1. What shipped

### Backend

| Area | Change |
|---|---|
| `backend/src/lib/user-edit-policy.ts` (new) | Pure policy module: `userPatchAccess` (static access matrix, evaluated before any DB read), `planUserPatchEffects` (name/email/avatar/status deltas, `revokeSessions`, `reinvite`, `expireInvites`), `emailChangeSummary` (activity text with a name and an outcome, never an address). |
| `backend/src/routes/users.ts` | `PATCH /users/:id` rewritten as a single `db.transaction`: `lockUserForInvite` first, `managerOwnsInTx` on the locked row, archived guard, unusable-hash guard, effects plan, in-tx duplicate-email probe, one `update` with `isUniqueViolation` -> `409`, invite issue/expire and refresh revocation on the same tx, activity on the same tx, mail only after commit. |
| `backend/src/lib/activity.ts` | `user.email_changed` added to the `ActivityAction` union next to `user.renamed` / `user.invite_resent` / `user.updated`. |
| `backend/scripts/smoke.ts` | New `teamEditsScenario` (domain `team-edits`) plus the `smoke.ts:1617` invites assertion update. |
| `backend/tests/user-edit-policy.test.ts` (new) | 12 DB-free tests for the access matrix, the effects table, the summaries and the empty-key-set case. |
| `backend/tests/contract.test.ts` | Anonymous `PATCH /users/:id` still answers `401` (contract unchanged). |

### Frontend

| Area | Change |
|---|---|
| `app/lib/school/api/school.ts` | `updateUser` shapes the body per actor (manager: name only; admin: trimmed lowercase email) and returns `{ invite? }`; `updateTeacher` / `updateStudent` return `PersonEditResult` (`invite?` plus a `warning?` when the profile PATCH failed after the account PATCH, so a committed invitation is never lost). |
| `app/lib/school/services/people.ts` | `assertManagerKeepsStoredEmail` applies the manager email rule in the API branch too (review N1), alongside `assertManagerKeepsEmail` in the local branch; `updateTeacher` / `updateStudent` / `updateManager` return `PersonEditResult` with a `finally`-refresh of the local store. |
| `app/components/manager/PeopleForms.tsx` | `lockEmail` disables the Email input; `emailNote` renders `email-locked-note` when locked and `email-invite-note` otherwise; shared `EMAIL_ADMIN_ONLY_NOTE` / `EMAIL_INVITED_NOTE` copy. |
| `ManagerTeachers.tsx`, `ManagerStudents.tsx`, `AdminManagers.tsx` | Pass the lock/note and open `InviteResultModal` when an invite is issued. |

### Tests

| Suite | New coverage |
|---|---|
| `frontend/tests/people-api-edit.test.ts` (new) | Request shaping (manager sends `["name"]`, admin sends a trimmed lowercase email), the partial-save result with the invite preserved, the invite outcome. |
| `frontend/tests/people-api-guard.test.ts` (new) | API-branch manager email rule: teacher and student refused before any request, unchanged email in another case allowed, admin allowed, name-only edit allowed, invite passed through. |
| `frontend/tests/people-edit-rules.test.ts` (new) | Local/demo parity: a manager email change is refused, a name edit succeeds. |
| `frontend/tests/permissions.test.ts` | `teacher.manage` / `student.manage` matrix rows. |
| `frontend/e2e/api/manager-team-edits.spec.ts` (new) | 3 API-mode flows: manager teacher edit + pause/reactivate, manager student edit + pause/reactivate, admin invited-email change (old link dead, new link works). |
| `frontend/e2e/demo/regression.spec.ts` | Demo fence: a demo manager edits a name, the Email field is disabled with the note, zero `/api/v1/` requests. |

---

## 2. Gates

All green. Exact numbers, not targets.

| Gate | Result | Numbers |
|---|---|---|
| `npm run typecheck` | PASS | exit 0, both workspaces |
| `npm run lint` | PASS | exit 0, both workspaces |
| `npm run test --workspace @lumina/backend` | PASS | 13 files / 111 tests (target >= 13 / >= 110) |
| `npm run test --workspace @lumina/frontend` | PASS | 14 files / 87 tests (target >= 13 / >= 75) |
| `npm run smoke` | PASS | 18/18 domains, 1060 checks (target >= 18 / >= 910) |
| `npm run e2e` | PASS | 33 API + 6 demo (target >= 33 + 6) |
| `git diff --check` | PASS | exit 0, CRLF advisory warnings only |
| `git status --porcelain -- backend/src/db` | PASS | empty |
| dependency diff | PASS | empty (`package.json`, `package-lock.json`, both workspaces) |
| logging grep | PASS | no `console.*`, no logger call with an email or token in `users.ts`, `user-edit-policy.ts`, `activity.ts` |
| Agent-probe AC-16 | PASS | 4 screenshots, 1440x950 and 390x844 |

Ports 3000 / 3100 / 4000 were verified free before every `npm run e2e` invocation (three times), per Hard Stop 4.

---

## 3. Findings during execution

### 3.1 Smoke fixture case bug (not a product bug)

The first `teamEditsScenario` run failed its mailbox and DB comparisons. Root cause: the writers lowercase the address through zod before the insert — `backend/src/routes/users.ts:73` and `:86` (create and update schemas) and `backend/src/lib/school-import.ts:518`. The smoke fixtures built expectations from camelCase `emailFor()` labels, so an exact string compare could never match.

Fix: the smoke assertions normalize both sides with `.toLowerCase()`. Confirmed by the lowercase-writer grep recorded in `harness/manager-team-edits/verification.json` (`manualChecks`). The product behaviour was correct before the fix; only the fixture expectation was wrong.

### 3.2 Demo spec insertion error

The new demo test was first inserted inside the body of the preceding test in `frontend/e2e/demo/regression.spec.ts`, leaving the file unparsable (`TS1005: '}' expected`). Repaired by closing the preceding test before the new block; the new test now sits after it.

### 3.3 Strict-mode selector in the new API spec

`.modal-footer button:has-text("Edit")` matched both `Credits` and `Edit` on the student modal. Replaced with `.modal-footer` scoped `getByRole("button", { name: "Edit", exact: true })`.

### 3.4 Probe token hygiene

The first invite-result capture showed the live invitation link in the screenshot. Re-captured with the link input masked (`page.screenshot({ mask: [...] })`) so no token is stored in the repo. The probe user was archived in a `finally` block either way.

### 3.5 Review follow-up: N1 and N2 fixed (26-11-26)

The user chose to fix the two real review findings before committing, rather than ship them as backlog.

- **N1 — silent email drop in API mode.** `people.ts` now calls `assertManagerKeepsStoredEmail(actorId, userId, nextEmail)` at the start of the API branch of `updateTeacher` / `updateStudent`. It reads the current users from the browser store (the same data the local branch uses) and throws `ServiceError("Only an admin can change an email address.")` when a manager actually changed the address, so no request is sent and the UI reports the refusal. An unknown actor or target falls through to the server, which enforces the rule authoritatively.
- **N2 — lost invitation link on partial failure.** `savedAccountOnly` is gone. `updateTeacher` / `updateStudent` return `{ invite?, warning? }`: the committed account save stays a success, `warning` explains that the profile details were not saved, and the invite is preserved. `ManagerTeachers`, `ManagerStudents` and `AdminManagers` show `warning` in the notice and still open `InviteResultModal` when an invite came back. This is a recorded deviation from plan D13 (which specified a rethrow); the reviewer's alternative fix ("return `{ invite, warning }`") was taken.
- **N3 (incidental).** The partial-failure copy is now "The account was saved, but the profile details were not: …", which is true for a manager (name only) as well as an admin, removing the false "Name and email were saved" wording.
- **N4–N10** remain recorded and unchanged.

Gates re-run after the fix: `typecheck` PASS, `lint` PASS, frontend vitest **14 files / 87 tests** PASS, `npm run e2e` PASS (ports 3000/3100/4000 verified free first; 33 API + 6 demo). No backend file changed, so backend vitest and smoke are unaffected.

---

## 4. What this does not prove (residuals on record)

Recorded, never counted as PASS:

1. **15-minute access-token window.** An access JWT issued before a pause or an admin email change keeps working until it expires. Only refresh tokens are revoked. Existing note: `access-token-revocation_NOTE_24-11-26.md`.
2. **Sub-second ownership reassignment race.** The users row is locked, but a profile/enrollment reassignment that commits after the in-transaction ownership read is not blocked. Note to create: `manager-ownership-reassign-race_NOTE_26-11-26.md`.
3. **A manager may reactivate a member an admin paused** (decision U2, accepted). Status changes are activity-logged with the actor.
4. **Admin invited-email change uses cooldown 0** (decision D8). One new mail per admin edit, bounded by admin-only access and the per-IP limit until `per-sender-invite-limit_NOTE_25-11-26.md`.
5. **Frontend component-level rendering is not covered by vitest** (no component-test tier exists). The disabled Email and the notes are proven by e2e and the AC-16 probe.
6. **The two-call frontend edit is not atomic** (user PATCH then profile PATCH). After the N2 fix the UI states exactly which part was saved and a committed invitation still opens, but the two writes are still separate. Note to create: `user-edit-two-call-atomicity_NOTE_26-11-26.md`.

---

## 5. Evidence pack

`process/features/launch-readiness/completed/manager-team-edits_26-11-26/harness/manager-team-edits/`

| Artifact | Content |
|---|---|
| `risk-gate.json` | High risk (permission/trust boundary, auth/identity, public API contract, session handling), `mustStopBeforeFinalize: true` |
| `context-snippets.json` | 34 file:line anchors across policy, route, invites, activity, tests and UI |
| `verification.json` | 10 commands, 17 plan steps, 3 manual checks (probe, lowercase-writer grep, independent EVL) |
| `adversarial-validation.json` | 12 scenarios: manager email takeover, archive undo, ownership oracle, TOCTOU, stale invite, mail volume, partial apply, activity on rollback, email leakage, admin-pause undo, access-token window, never-activated account |
| `review-decision.json` | Reviewer verdict + the user's decision (written after the review) |
| `screenshots/ac16-*.png` | Manager edit form (Email disabled + note) and invite-result modal, 1440x950 and 390x844, link masked |

---

## 6. Backlog artifacts for durable capture (UPDATE PROCESS)

To create:

- `process/features/launch-readiness/backlog/manager-list-visibility-mismatch_NOTE_26-11-26.md`
- `process/features/launch-readiness/backlog/user-edit-two-call-atomicity_NOTE_26-11-26.md`
- `process/features/launch-readiness/backlog/manager-ownership-reassign-race_NOTE_26-11-26.md`

To annotate (not new):

- `manager-edit-team-member-403_NOTE_25-11-26.md` — resolved by this plan.
- `account-invites-review-residuals_NOTE_25-11-26.md` — item 9, manager side, closed by decision U1 plus the automatic admin path (U4).
- `access-token-revocation_NOTE_24-11-26.md` — unchanged; the pause and email-change paths only revoke refresh tokens.
- `per-sender-invite-limit_NOTE_25-11-26.md` — unchanged; the admin email-change path deliberately uses cooldown 0.

---

## 7. Verdict

### 7.1 Independent EVL run

Fresh-context agent, same gate list, nothing taken on trust. **All 10 gates PASS with margins; claims a–g CONFIRMED.**

| Gate | Result | Numbers |
|---|---|---|
| typecheck | PASS | exit 0 |
| lint | PASS | exit 0 |
| backend vitest | PASS | 13 files / 111 tests |
| frontend vitest | PASS | 13 files / 80 tests |
| smoke | PASS | 18/18 domains, 1060 checks (team-edits 224 checks; profile 19, invites 131, auth 58) |
| e2e | PASS | ports free 3000/3100/4000; 33 API + 6 demo |
| `git diff --check` | PASS | exit 0 |
| `backend/src/db` | PASS | empty |
| dependency diff | PASS | empty |
| logging grep | PASS | 0 matches in all three files |

Claims confirmed by reading the code: the transaction opens at `users.ts:449` with `lockUserForInvite` first (`:451`); the static deny runs before any read (`:433-443`); the archived guard is inside the tx (`:459`); `issueInvite` runs on the tx (`:508`) and `deliverInvite` only after commit (`:559`); `revokeSessions` applies on the tx (`:512`); `emailChangeSummary` is name-only (`user-edit-policy.ts:111-118`); the manager body is `{ name }` only (`school.ts:85-88`).

Two notes from the EVL agent:

1. **Pack completeness.** It recorded its verdict as FAIL for one reason only: `review-decision.json` did not exist yet, and the plan says the work is not ready until it does. That artifact is the output of the review in §7.2 and your decision in §7.3, so this is sequencing, not a defect. No code change was implied or made.
2. **Logging-gate caveat.** The plan's `git grep` form cannot see the untracked `user-edit-policy.ts`. The EVL agent re-ran the search against file contents: still 0 matches.

No hard-stop event: no real mail, no env read, no data mutation, and the working tree was identical before and after the EVL run.

### 7.2 Code review

Independent reviewer, fresh context, verdict **APPROVE WITH CONCERNS**, no blocking findings.

Two real defects were confirmed in the source by the orchestrator:

1. **Silent email drop in API mode.** `frontend/app/lib/school/services/people.ts:166-176` (and `:280-295` for students) never calls `assertManagerKeepsEmail` on the API branch; only the local branch does (`:183` / `:295`). With `school.ts:86-88` dropping `email` for non-admins, a manager's email change is discarded in API mode while the UI reports success. §1 of this report claimed the guard covered both branches — it does not.
2. **Lost invitation link on partial failure.** `school.ts:100-109` with `:142-157`: when the profile PATCH fails after a successful invited-email change, `savedAccountOnly` throws and discards `saved.invite`. The invitation committed and the link was returned, but `InviteResultModal` never opens and the message never mentions the invitation.

Recorded, non-blocking: misleading "Name and email were saved" copy for a manager (plan-mandated, **fixed incidentally with N2**); dead `passwordUnusable` parameter in `planUserEditEffects`; redundant `expireInvites` on an already-paused target; the note rendered as a `<small>` inside `<label>` instead of `aria-describedby`; pause authority over an enrollment-only student untested by smoke; `authenticate` never checks account status, so a paused manager keeps team-write authority for up to 15 minutes; the report status line was out of step with the pack while EVL was pending; `review-decision.json` was absent at EVL time.

Full list with file:line: `harness/manager-team-edits/review-decision.json`.

**Resolution of the two real findings (26-11-26):** both are fixed — see §3.5 and the plan's "Review Follow-Up". N1 is guarded before the request in both API branches; N2 preserves the invite through a partial save. The remaining eight findings stay recorded as accepted or backlog.

### 7.3 User decision and commit

**Superseded 26-11-26.** The earlier "on hold" decision was reversed: the user asked to continue the plan, chose **"Fix N1 + N2, then gates + commit"**, and the fixes were made, gated and committed as the checkpoint described in §3.5.

`review-decision.json` still records the original `decision: "on-hold"` (the state at review time). The follow-up resolution is recorded in `verification.json` and in this report.

To resume from here: the code work is closed. Remaining work is UPDATE PROCESS only — the three backlog notes, the four annotations and the context-doc updates listed in §6.
