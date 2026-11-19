---
name: context:all-uxui
description: "Next.js 16 / React 19 / Tailwind 4 frontend: app shell, role components, school data layer, styling — the uxui group entrypoint/router"
keywords: uxui, frontend, next.js, react, tailwind, components, LuminaApp, store, ServiceResult, globals.css, role dashboard, styling
related: [context:all-auth, context:all-database]
date: 17-11-26
---

# UX/UI Context

BLUF: The frontend (`frontend/`, `@lumina/frontend`) is a Next.js 16.4 App Router app with React 19, Tailwind 4 and TypeScript strict. One client shell (`components/LuminaApp.tsx`) renders role-specific components; state lives in an external store plus per-role hooks (no Redux/Zustand). Next 16 differs from older versions — read `frontend/AGENTS.md` and `node_modules/next/dist/docs/` before writing Next code.

## Scope

This group covers: app shell and role components, the `lib/school` data layer (store, services, adapters), and styling. It does not cover auth flags (see `process/context/auth/`) or DB schema (see `process/context/database/`).

## Read When

- adding or changing a screen/component under `frontend/app/components/`
- adding a service or changing local/API data behavior in `frontend/app/lib/school/`
- editing styles in `frontend/app/globals.css`

## Quick Routing

- use `process/context/uxui/app-shell-and-roles.md` for the component tree and per-role layout
- use `process/context/uxui/school-data-layer.md` for store, ServiceResult, and dual local/API service branches
- use `process/context/uxui/styling-tailwind4.md` for Tailwind 4, globals.css conventions, and the Next 16 docs gotcha

## Source Paths

- `process/context/uxui/app-shell-and-roles.md`
- `process/context/uxui/school-data-layer.md`
- `process/context/uxui/styling-tailwind4.md`
- Code: `frontend/app/`, planning docs `frontend/ADMIN_PLAN.md`, `frontend/CUTOVER_PLAN.md`, `frontend/CUTOVER_PROGRESS.md`, `frontend/PROGRESS.md`

## Update Triggers

- new role area/component folder or navigation change
- service/store contract changes, new `lib/school/api/*` module
- styling approach moves away from the single `globals.css`

## Canonical Notes

- use `process/context/uxui/all-uxui.md` as the entrypoint
- Frontend has a browser parity suite (`npm run e2e`) but no unit/component runner; verify component work
  with typecheck, lint, and the suite, then a manual browser check in demo and API mode.
