# Planning Context

This file is the canonical planning context entrypoint for lumina-esl.

**BLUF:** New RIPER-5 plans live in task folders under `process/features/{feature}/active/` or `process/general-plans/active/`. The legacy `frontend/*.md` planning docs stay in place and remain the source of truth for backend-cutover status. Read `frontend/CUTOVER_PLAN.md` and `frontend/CUTOVER_PROGRESS.md` before any cutover work.

## Read When

- creating a plan with `vc-generate-plan`
- checking SIMPLE vs COMPLEX
- touching backend cutover, curriculum, scheduling, or people/billing work

## Where Plans Go

| Work area | Plan location |
|---|---|
| Backend cutover (frontend local store to API) | `process/features/backend-cutover/active/{slug}_{dd-mm-yy}/` |
| Curriculum (courses, units, lesson plans, planned Curriculum Library) | `process/features/curriculum/active/{slug}_{dd-mm-yy}/` |
| Lessons and scheduling (bookings, slots, lessons, ratings, room codes, homework, notifications) | `process/features/lessons-scheduling/active/{slug}_{dd-mm-yy}/` |
| People and billing (users/roles, managers, approvals, enrollments, profiles, credits) | `process/features/people-billing/active/{slug}_{dd-mm-yy}/` |
| Cross-cutting or small | `process/general-plans/active/{slug}_{dd-mm-yy}/` |

Each task folder holds `{slug}_PLAN_{dd-mm-yy}.md` plus colocated reports. Flat legacy plan shapes are read-only.

## Legacy Planning Docs (stay in `frontend/`, linked not moved)

| Doc | Role | Status |
|---|---|---|
| `frontend/ADMIN_PLAN.md` | Admin/manager product plan | All phases done |
| `frontend/CUTOVER_PLAN.md` | File-level plan for cutting the frontend over to the real API | Active reference |
| `frontend/CUTOVER_PROGRESS.md` | Live cutover board and dated verification log | Step A, B0.1 to B0.4, B1, B2 done; Step B3 (domain slices) next; Step C (uploads, notifications) and Step D (parity, removal) not started |
| `frontend/PROGRESS.md` | App-wide state and verification commands | Current |

## Rules

- New RIPER work touching the cutover reads `CUTOVER_PLAN.md` and `CUTOVER_PROGRESS.md` first.
- When a slice lands, update the `CUTOVER_PROGRESS.md` board (and its verification log) in the same change.
- Curriculum Library (admin uploads materials, teachers attach to bookings, students/parents view) is PLANNED, NOT BUILT. Lesson-plan attachments and the uploads route exist today.
- Care areas every plan should address: auth mode switching (keep `NEXT_PUBLIC_DEMO_MODE` separate from real JWT auth), scheduling and credits (atomic booking, correct refunds), Drizzle migrations synced with schema and API types.
- Commit directly on `developing` (solo developer; `main` is a later merge target).

## Plan Shape Calibration

- `.claude/skills/vc-generate-plan/references/example-simple-prd.md` for a one-session plan
- `.claude/skills/vc-generate-plan/references/example-complex-prd.md` for complex or multi-phase plans

## Update Triggers

- plan artifact contract changes
- a cutover step completes or is re-scoped
- feature folders are added or renamed
- example plan shapes move or go stale

---

**Status:** DONE
**Summary:** Populated from study findings and user answers.
