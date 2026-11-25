---
name: note:attachment-access-scope
description: "Backlog: any authenticated user can download an attachment by UUID; downloads are not scoped to the owning course, lesson, or request"
date: 18-11-26
feature: backend-cutover
---

# Attachment access scope

status: BLOCKED
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

## Next step

NEW PLAN REQUIRED: decide the ownership rule per attachment kind (course/plan visibility vs.
request visibility vs. student submission) and enforce it in the download routes, or move to
short-lived signed URLs. Keep the demo/local branch unchanged.
