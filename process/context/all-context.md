---
name: context:all-context
description: "Root context router: repo architecture, stack, structure, conventions, testing gates, and routing to the context groups"
keywords: context router, architecture, repository structure, technology stack, conventions, lumina esl, where to look, backend, frontend, postgres, cutover
related: [context:all-planning, context:all-tests, context:all-database, context:all-auth, context:all-uxui]
metadata:
  read_when: any substantial planning, research, review, or implementation task
date: 18-11-26
---
# lumina-esl - All Context

Last updated: 2026-11-18

**Lumina ESL is a real ESL (English as a second language) school management platform** for institution admins, managers, teachers, and students (parents act through the student account; they are not a login role). Lessons are **1:1 and 25 minutes**; each student is enrolled with one teacher in a curriculum course, and each booked lesson consumes the next lesson plan. No group classes. Billing is **credit-based**. Staff is two-level: admin creates managers and assigns teachers; each manager sees only their own teachers, students, and approvals; admin sees everything. Virtual classrooms use flexible meeting links (ClassIn / Zoom / Google Meet, no paid SDKs) stored in `lessons.roomCode`.

This file is the root context entrypoint for the repo.

Use it for two things:

1. quick routing to the right context pack or root file
2. broad architecture and repository understanding

Start here before loading deeper context files.

---

## How This File Works (the `all-*.md` Convention)

Every `process/context/` directory has one `all-*.md` entrypoint that acts as an attachable quick router for that domain. This root file (`all-context.md`) is the top-level router. Context groups each have their own `all-{group}.md` entrypoint.

**The pattern:**

```
process/context/
  all-context.md                      <-- THIS FILE: root router
  planning/
    all-planning.md                   <-- group router for planning
  tests/
    all-tests.md                      <-- group router for tests
  database/
    all-database.md                   <-- group router for database
  auth/
    all-auth.md                       <-- group router for auth
  uxui/
    all-uxui.md                       <-- group router for UI/UX
```

**How agents use it:**

1. Agent reads `all-context.md` first (this file)
2. Finds the relevant context group from the routing tables below
3. Reads that group's `all-{group}.md` entrypoint
4. Only then loads the specific deep doc needed

This layered routing keeps context windows small. Never load the whole `process/context/` tree.

**What each `all-{group}.md` must contain:**

- Scope (what the group covers and does NOT cover)
- Read-when rules (when an agent should load this group)
- Quick procedures or decision rules
- Source paths (list of deeper docs in the group)
- Update triggers (when to refresh this group's content)
- Routing to deeper docs within the group

---

## Quick Start

For most substantial tasks:

1. read this file first
2. choose the smallest relevant root file or context group from the tables below
3. only then load deeper files

---

## Current Root Entry Points

<!-- The two tables below (Root Entry Points + Context Groups) are GENERATED from each
     context doc's frontmatter by `discover-context.mjs --emit-routing`. Do NOT hand-edit
     between the GENERATED markers — your edits will be overwritten on the next rebuild.
     To change a row, edit the owning doc's frontmatter (description / keywords) and re-emit.
     `--check-routing` fails lint if this block drifts from the frontmatter on disk. -->

<!-- GENERATED:routing -->
| File | Read when |
|---|---|
| `process/context/all-context.md` | any substantial planning, research, review, or implementation task |
| `process/context/auth/all-auth.md` | JWT + refresh-cookie auth, role scoping, and demo-vs-API mode — the auth group entrypoint/router |
| `process/context/database/all-database.md` | Drizzle/PostgreSQL schema, migrations, seed/reset, and booking/credit integrity — the database group entrypoint/router |
| `process/context/planning/all-planning.md` | creating, resuming, or archiving a plan |
| `process/context/tests/all-tests.md` | testing, verification gates, or debugging runtime failures |
| `process/context/uxui/all-uxui.md` | Next.js 16 / React 19 / Tailwind 4 frontend: app shell, role components, school data layer, styling — the uxui group entrypoint/router |

## Current Context Groups

| Group | Entry point | Scope |
|---|---|---|
| `auth/` | `process/context/auth/all-auth.md` | JWT + refresh-cookie auth, role scoping, and demo-vs-API mode — the auth group entrypoint/router |
| `database/` | `process/context/database/all-database.md` | Drizzle/PostgreSQL schema, migrations, seed/reset, and booking/credit integrity — the database group entrypoint/router |
| `planning/` | `process/context/planning/all-planning.md` | Plan formats, task folders, and the existing cutover and feature plans |
| `tests/` | `process/context/tests/all-tests.md` | Test and verification guide: backend vitest, per-domain API smoke, gates, and known gaps |
| `uxui/` | `process/context/uxui/all-uxui.md` | Next.js 16 / React 19 / Tailwind 4 frontend: app shell, role components, school data layer, styling — the uxui group entrypoint/router |
<!-- /GENERATED:routing -->

## Task Routing Table

| Task type | Load first | Then load |
|---|---|---|
| schema change / migration | `all-context.md`, `database/all-database.md` | feature `curriculum` or `lessons-scheduling` plans |
| booking, slots, credits, refunds | `all-context.md`, `database/all-database.md` | `process/features/lessons-scheduling/`, `process/features/people-billing/` |
| auth, login, roles, demo-mode switching | `all-context.md`, `auth/all-auth.md` | `frontend/CUTOVER_PROGRESS.md` |
| role screens / UI components | `all-context.md`, `uxui/all-uxui.md` | `frontend/ADMIN_PLAN.md`, `frontend/PROGRESS.md` |
| data-layer service (local + api branches) | `all-context.md`, `uxui/all-uxui.md` | `process/features/backend-cutover/` |
| tests / verification / debugging | `all-context.md`, `tests/all-tests.md` | smallest domain doc for the failure |
| planning / new plan | `all-context.md`, `planning/all-planning.md` | `process/features/*/active/` |
| curriculum / lesson plans / Curriculum Library | `all-context.md`, `database/all-database.md` | `process/features/curriculum/` |
| context maintenance | `all-context.md` | run `vc-audit-context` after edits |

## Feature Folders

| Folder | Scope |
|---|---|
| `process/features/backend-cutover/` | Frontend local-store to backend API cutover (Steps A-D, B3 domain slices) |
| `process/features/curriculum/` | Courses, units, lesson plans, attachments; planned (not built) Curriculum Library |
| `process/features/lessons-scheduling/` | Bookings, slot openings, lessons, ratings, room codes, homework/assignments, notifications |
| `process/features/people-billing/` | Users/roles, managers, approvals/requests, enrollments, profiles, credits/billing |

## Context Group Lifecycle

Context groups are durable knowledge domains, not feature folders.

Create a group when:

- a topic has 3+ durable docs
- a single doc exceeds roughly 800 lines with separable subtopics
- multiple agents repeatedly need only one slice of a large context file
- the topic maps to a stable operational domain (tests, infra, database, auth, UI, workflows, etc.)

Do not create a group when:

- the content is a temporary report
- the content is a plan or execution artifact
- the topic is feature-specific and belongs in `process/features/...`

Move or split one group at a time. Use `all-{group}.md` entrypoints. Run the `audit-context` skill after every context organization change.

## Naming Convention

There are no `README.md` files inside `process/context/`.

Canonical entrypoints use `all-*.md`:

- root: `process/context/all-context.md`
- group: `process/context/{group}/all-{group}.md`

Each `all-{group}.md` file should act as the attachable quick router for that domain:

- tell the agent what the group covers
- give quick procedures and decision rules
- route to smaller deeper files

## Context Update Protocol

When durable project knowledge changes:

1. update the smallest relevant context file
2. update this file if routing, ownership, naming, or groups changed
3. update the owning `all-{group}.md` entrypoint when a group exists
4. run `audit-context`

---

## Repository Structure

```
esl/                          -- npm workspaces monorepo "lumina-esl"
  package.json                -- root scripts: dev, build, typecheck, lint, test, db:*
  frontend/                   -- @lumina/frontend (Next.js 16 App Router)
    app/
      page.tsx, layout.tsx
      components/             -- LuminaApp.tsx shell + admin/ manager/ teacher/ student/ shared/
      lib/
        api/                  -- fetch client, ApiError, auth, types
        auth/                 -- mode.ts (demo/data-source flags), session.ts
        hooks/                -- useAuth, useCurrentUser, useSchool, ...
        school/               -- store, adapter, repositories, selectors, permissions, seed
          services/           -- ServiceResult services (local + api branches)
          api/                -- API-mode calls (bootstrap, bookings, credits, ...)
    ADMIN_PLAN.md, CUTOVER_PLAN.md, CUTOVER_PROGRESS.md, PROGRESS.md
  backend/                    -- @lumina/backend (Fastify 5, ESM)
    src/
      index.ts, app.ts        -- entry + buildApp({env})
      config/env.ts           -- Zod env schema
      plugins/                -- db.ts, auth.ts
      routes/                 -- auth users students teachers courses enrollments lessons
                                 bookings requests assignments credits notifications
                                 uploads settings school
      lib/                    -- errors, roles, scope, time, password, pagination, activity
      db/                     -- schema.ts, migrations/, seed.ts, reset.ts
    tests/                    -- app / contract / password vitest files
  process/
    context/                  -- this context system
    features/                 -- feature-scoped plans (4 folders)
    general-plans/            -- cross-cutting plans
    development-protocols/    -- RIPER-5 methodology docs
```

## Technology Stack

| Layer | Choice |
|---|---|
| Monorepo | npm workspaces, Node >=22, `package-lock.json` (npm) |
| Frontend | Next.js 16.4.6 (App Router), React 19.3.0, Tailwind 4.3.3 (`@tailwindcss/turbopack`), TypeScript 5, ESLint 9 + eslint-config-next |
| Backend | Fastify 5.2 with `@fastify/{cookie,cors,helmet,jwt,multipart,rate-limit}`, fastify-plugin, ESM |
| DB | PostgreSQL 15+ (local), drizzle-orm 0.38, drizzle-kit 0.30, `postgres` 3.4 driver |
| Validation | zod 3.24 (env, request bodies/query/params) |
| Runtime | `tsx` runs backend TS directly (no emitted build; backend "build" = typecheck) |
| Tests | vitest 3 (backend only); frontend has no tests |
| TS config | Backend: strict, noUncheckedIndexedAccess, verbatimModuleSyntax, noImplicitOverride, ES2022. Frontend: strict, bundler resolution |
| State (frontend) | `useState` + external store (`useSyncExternalStore`) + per-role hooks; no Redux/Zustand |
| Hosting | None yet; local Windows dev. Vercel / VPS planned. No CI. |

## Key Patterns and Conventions

**Backend route shape:** `export const xRoutes: FastifyPluginAsync = async (app) => { app.get(path, { preHandler: app.authenticate | app.requireRole([...]) }, handler) }`. Zod schemas at the top of the file; `schema.parse(request.body|query|params)`; claims via `request.user.sub` / `request.user.role`. Routes mount under `/api/v1` (see `backend/src/routes/index.ts`).

**Backend errors:** throw `AppError(statusCode, code, message, details)` via helpers `badRequest/unauthorized/forbidden/notFound/conflict(409)/unprocessable(422)`. Response shape `{error:{code,message,details?}}`; ZodError -> 400 `VALIDATION_ERROR`; 500 `INTERNAL_ERROR` (message hidden in production).

**Manager scoping:** `backend/src/lib/scope.ts` (`managerOwnsStudent`, `managerOwnsTeacher`, `managerTeam`). A manager's team = `managerId` on teacher/student profiles. Every manager-reachable route must apply it.

**Backend bootstrap:** `GET /api/v1/school/bootstrap` returns the role-scoped dataset the frontend store hydrates from.

**Frontend ServiceResult:** every service in `frontend/app/lib/school/services/` returns `ServiceResult<T> = {ok:true,value}|{ok:false,error}` (`ok()` / `fail()`; `run()` sync, `runAsync()` async convert ServiceError/PermissionError/ApiError).

**Dual-branch services:** each service branches on `isApiDataMode()`: API branch calls `frontend/app/lib/school/api/*`; local branch uses `updateSchool(draft => ...)` with `assertCan`, `changeCredits`, `recordActivity`. A change to one path usually needs the other mirrored.

**Naming:** role-prefixed PascalCase components (`StudentLessons.tsx`), hooks `useX.ts`, camelCase lib files; DB tables snake_case plural.

**Import aliases:** frontend `@/*` -> `./*`. Backend has no aliases (relative imports).

**Shared contract:** `frontend/app/lib/school/types.ts` is imported by a backend contract test; keep bootstrap collection/settings keys and `SCHOOL_SCHEMA_VERSION` in sync.

## Care Areas / Gotchas

**User-flagged risks (highest priority):**

| # | Area | Rule |
|---|---|---|
| 1 | Auth mode switching | Keep `NEXT_PUBLIC_DEMO_MODE` (mock/local) strictly separate from real JWT/API auth; mock data must never leak into production API calls |
| 2 | Scheduling and credits | Booking must be atomic (no double-booking); credit deductions and refunds on cancellation must be exact |
| 3 | DB migrations | Keep Drizzle migrations in `backend/` synced with `schema.ts` and the frontend/API types |

**Observed booking risks (not fixed):**

- (Resolved in B3: the balance is now the numeric `getCreditBalance`; postgres `numeric` is parsed to a JS number in `plugins/db.ts`.)
- Backend `POST /lessons` (teacher/manager/admin schedules a lesson) does NOT debit a credit, while the demo add-lesson paths debit 1; an early student cancel of such a lesson then refunds +1, so credits can be minted. Smoke asserts the current no-debit behavior. Backlog: `process/features/backend-cutover/backlog/booking-rules-followups_NOTE_18-11-26.md`.
- Plan selection (`resolveLessonDefaults`) is not locked; a student can self-purchase up to 100 credits with no payment check.
- Balance read and debit are not row-locked; concurrent bookings by one student could both pass.
- No unique constraint on `lessons` (teacher, date, time); only the `slot_openings` row claim (`DELETE ... RETURNING`) prevents double-booking.
- Refund paths: student cancel refunds only if hours-until >= `studentLateCancellationHours`; teacher absence refunds only if `refundTeacherCancellations` and lesson not already cancelled. Local-mode mirror uses `LESSON_CREDIT_HOURS` (1 credit per lesson; `SCHOOL_SCHEMA_VERSION` is 3 on both sides).

**Other gotchas:**

- `frontend/AGENTS.md` is auto-managed by `next dev` - do not edit or remove. Next 16 differs from training data; read `node_modules/next/dist/docs/` before writing Next code.
- `npm run db:reset` TRUNCATES all tables (refuses production). Destructive; never use it as a verification gate.
- Meeting links live in `lessons.roomCode` (max 40 chars), NOT `meeting_url`.
- Parents are not a login role: guardian fields on `student_profiles`; parent ratings go through the student account (`ratingSource: "parent"`).
- Curriculum Library (admin uploads, teacher attaches to bookings, student/parent views) is planned, not built. Only lesson-plan attachments and the uploads route exist. API mode stores bytes under `UPLOAD_DIR` with metadata in `attachments` (5 MB cap; pdf, images, Word, PowerPoint); demo keeps IndexedDB/localStorage behind `attachment-download.ts`.
- The bell is the activity feed merged with the role derivation (deduped by target, cap 30). Read ids and muted categories are per user in `notification_state` via `GET`/`PATCH /notifications/state`; demo mode still uses localStorage. Notification ids are stored server-side, so keep them short.
- Demo mode is the DEFAULT (`isDemoMode()` true unless `NEXT_PUBLIC_DEMO_MODE === "false"`). `LuminaApp.tsx` seeds `studentCredits` local state at 24 (matches the demo seed).
- The working tree holds large uncommitted cutover work; check `git status` before assuming a clean base.

## Environment and Configuration

**Config files:** root `package.json`, `backend/drizzle.config.ts`, `backend/vitest.config.ts`, per-workspace `tsconfig.json` and `eslint.config.mjs`, backend and frontend local env files (git-ignored; the frontend example env file is committed).

**Env var names (never values):**

- Backend: `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`, `DATABASE_URL` (required), `JWT_SECRET` (min 32 chars), `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `CORS_ORIGIN` (comma list), `UPLOAD_DIR`, `RATE_LIMIT_MAX` (optional, default 300; raise only for smoke/load runs)
- Frontend: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DEMO_MODE`, `NEXT_PUBLIC_DATA_SOURCE`

**Mode flag semantics (`frontend/app/lib/auth/mode.ts`):**

| Flag state | Result |
|---|---|
| `NEXT_PUBLIC_DEMO_MODE` unset or not `"false"` | Demo mode: local browser store (`lumina-school:v1`), any non-empty password |
| `NEXT_PUBLIC_DEMO_MODE="false"` and `NEXT_PUBLIC_DATA_SOURCE="api"` | API data mode (`isApiDataMode()`): JWT auth + backend |
| Demo off, data source not `"api"` | Real auth, local data store |

Demo accounts (`@lumina.school`): admin@, manager@, manager2@, teacher@, student@. API-mode password is documented in the seed/progress docs, not here.

**Dev commands:** `npm run dev` (web + api), `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend`, `npm run db:migrate|generate|push|seed|reset|studio`, `npm run smoke` (per-domain API smoke; see `tests/all-tests.md`).

## Existing Planning Docs

These stay in place and remain the source of truth for cutover status.

| Doc | Status |
|---|---|
| `frontend/ADMIN_PLAN.md` | Admin/manager product plan; all phases done |
| `frontend/CUTOVER_PLAN.md` | File-level plan for local-store to API cutover |
| `frontend/CUTOVER_PROGRESS.md` | Live board: Steps A, B0.1-B0.4, B1, B2, B3, and C done; Step D (parity/removal) next |
| `frontend/PROGRESS.md` | App-wide state and verification commands |

## Workflow

- Solo developer. Agents commit directly on the `developing` branch (`main` is the later merge target). This overrides the harness default of branching first; see `CLAUDE.md` and `process/development-protocols/implementation-standards.md`.
- Local Windows dev only: local PostgreSQL 15+, Next.js, Node backend. No CI/CD, no external services beyond Postgres. Vercel/VPS deploy planned later.
- Fully-automated gates: `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend`, `git diff --check`. Hybrid (needs Postgres + backend env file): `npm run db:migrate`, `npm run smoke` (13 domains, 343 checks; temp backend on 127.0.0.1:4100, local DB only, never resets), browser check in demo and API mode.

## Validator Registry

Core regression validators (from `process/development-protocols/orchestration.md` Regression Gate Validators), run from repo root:

| Validator | Path |
|---|---|
| agent parity | `.claude/skills/vc-audit-vc/scripts/validate-agent-parity.mjs` |
| skills | `.claude/skills/vc-audit-vc/scripts/validate-skills.mjs` |
| kit portability | `.claude/skills/vc-audit-vc/scripts/validate-kit-portability.mjs` |
| context discovery | `.claude/skills/vc-audit-context/scripts/validate-context-discovery.mjs` |
| plan inventory | `.claude/skills/vc-audit-plans/scripts/validate-plan-inventory.mjs` |
| guide sync | `.claude/skills/vc-audit-vc/scripts/validate-guide-sync.mjs` |
| protocol wiring | `.claude/skills/vc-audit-vc/scripts/validate-protocol-wiring.mjs` |
| skill invocation wiring | `.claude/skills/vc-audit-vc/scripts/validate-skill-invocation-wiring.mjs` |
| agent frontmatter | `.claude/skills/vc-audit-vc/scripts/validate-agent-frontmatter.mjs` |
| all-context structure | `.claude/skills/vc-generate-context/scripts/validate-all-context.mjs` |

Behavior and artifact validators live in each skill's `scripts/` folder, with pass/fail `fixtures/` where present: `vc-audit-plans` (backlog-notes, eval-coverage, phase-plan-completeness, phase-reports, umbrella-state), `vc-audit-context` (protocol-discovery, skill-routing, skill-keywords, skill-cross-refs, skill-dependencies, confusable-skills), `vc-audit-vc` (seeds), `vc-autopilot`, `vc-autoresearch`, `vc-feasibility-test`, `vc-generate-closeout`, `vc-generate-phase-program` (phase-stub, umbrella-artifact), `vc-generate-plan` (plan-artifact), `vc-intent-clarify`, `vc-plan-discovery`, `vc-risk-evidence-pack`, `vc-test-coverage-plan`, `vc-validate-findings`, `vc-agent-strategy-compare`, `vc-context-discovery`. Run the change-type-relevant one before closing a phase.

## References

Key files: `backend/src/app.ts`, `backend/src/db/schema.ts`, `backend/src/routes/index.ts`, `frontend/app/lib/auth/mode.ts`, `frontend/app/lib/school/services/result.ts`, `frontend/app/components/LuminaApp.tsx`.

## Open Questions / Outstanding Work

- Cutover Step D (parity suite, one-time import, remove the browser-store fallback) not started.
- No committed browser/e2e suite: Step C was verified with ad-hoc Playwright runs; Step D adds the parity suite.
- Booking concurrency/precision risks above are unresolved.
- Curriculum Library not built; no frontend tests; no CI.

## Scan Metadata

- Generated: 2026-11-17
- HEAD: 0574d1f13844003b80e4ab97b5ad5ee26f0084b7
- Mode: fresh
- Package manager: npm
