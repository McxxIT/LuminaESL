---
name: context:uxui-styling-tailwind4
description: "Tailwind 4 setup, globals.css conventions, and the Next 16 documentation gotcha"
keywords: tailwind, tailwind 4, globals.css, css, styling, design tokens, next 16, AGENTS.md, theme, layout
related: [context:all-uxui]
date: 17-11-26
---

# Styling (Tailwind 4) and Next 16

BLUF: Styling is Tailwind 4.3 (`@import "tailwindcss"` via `@tailwindcss/turbopack`) but most UI is hand-written class CSS in one file, `frontend/app/globals.css` (~1,700 lines). Match existing class patterns before introducing utilities.

## Conventions

- Tokens in `:root`: `--background #f8faff`, `--foreground #0b1c30`, `--border #e2e8f0`, `--muted #64748b`, `--primary #4f46e5` (indigo). `@theme inline` maps color/font vars.
- Class families: `.auth-*` (login), `.app-shell`, `.sidebar`, `.nav-list`, `.nav-item(.active)`, `.brand*`, `.profile-card`, etc. Many rules are minified onto single lines.
- `html, body { height:100%; overflow:hidden }` — pages scroll inside panels, not the document.
- Responsive tweaks use `@media (max-height: 800px)` for the sidebar.
- Focus ring: `button:focus-visible` 3px indigo outline; keep it.

## Gotchas

- `frontend/AGENTS.md` (auto-managed by `next dev`; do not edit or remove) warns that Next 16 has breaking changes versus training data — read `frontend/node_modules/next/dist/docs/` before writing Next code (routing, caching, params as promises, etc.).
- Tailwind 4 uses CSS-first config (no `tailwind.config.js`); put theme additions in `globals.css`.
- Lint: `frontend/eslint.config.mjs` (next core-web-vitals + typescript). Verify with `npm run typecheck`, `npm run lint`, `npm run build`, and a manual browser check — there are no frontend tests.
