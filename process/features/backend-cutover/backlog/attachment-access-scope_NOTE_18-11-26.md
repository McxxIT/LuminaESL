---
name: note:attachment-access-scope
description: "Backlog: any authenticated user can download an attachment by UUID; downloads are not scoped to the owning course, lesson, or request"
date: 18-11-26
feature: backend-cutover
---

# Attachment access scope

status: done (23-11-26)
item: C-RISK-ATTACHMENT-SCOPE (from step-c-uploads-notifications_PLAN_18-11-26, risk section)
reason: Download scoping needs per-record ownership rules that do not exist for lesson plans and request evidence yet.

## Gap

- `GET /uploads/:id` and `GET /uploads/:id/download` only require a valid session
  (`preHandler: app.authenticate`). Any signed-in user who knows or guesses an attachment UUID
  can read the metadata and the bytes.
- The bootstrap only ships attachment rows the actor can see (plan files, request evidence), so
  the UI never leaks ids. The route itself does not re-derive that scope.
- Public downloads cannot use a bearer-token `<a href>`, so API-mode clients always fetch through
  `requestBlob`; the shared helper is the single place to add any future scope check.

## Resolution

Done 23-11-26 in `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/`
(Phase 02). `backend/src/lib/scope.ts` now exports `canAccessAttachment` /
`assertCanAccessAttachment`, enforced in both `GET /uploads/:id` and `GET /uploads/:id/download`:

- Admin: always allowed.
- Uploader (`attachments.uploadedBy === actor.sub`): always allowed, covering the pre-attach
  window right after `POST /uploads`.
- Request evidence (`requests.attachment_id`): target/requesting teacher and their manager;
  students and cross-team managers get `403`.
- Lesson-plan files (`lesson_plans.attachment_ids`): mirrors `GET /school/bootstrap` 1:1 —
  manager for a published/owned course or a team lesson using the plan; teacher/student when
  enrolled in the course or assigned to a lesson using the plan.
- Any other upload: `403`.

Gates: `npm run smoke` (`uploads` + `requests` matrices) and
`frontend/e2e/api/uploads.spec.ts`. Phase 04 will extend the helper for library items.

## Next step

None. Closed.
