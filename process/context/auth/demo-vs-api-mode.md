---
name: context:auth-demo-vs-api-mode
description: "isDemoMode/isApiDataMode semantics, env flags, demo accounts, and how to keep mock data out of API calls"
keywords: demo mode, api mode, NEXT_PUBLIC_DEMO_MODE, NEXT_PUBLIC_DATA_SOURCE, isDemoMode, isApiDataMode, mock data, demo accounts, localStorage
related: [context:all-auth, context:all-uxui]
date: 17-11-26
---

# Demo vs API Mode

BLUF: Demo mode is the DEFAULT. `isDemoMode()` is true unless `NEXT_PUBLIC_DEMO_MODE === "false"`. `isApiDataMode()` is true only when `NEXT_PUBLIC_DATA_SOURCE === "api"` AND demo is off. Never let demo/mock data reach API calls or the reverse. User-flagged care area #1.

## Flags (`frontend/app/lib/auth/mode.ts`)

| NEXT_PUBLIC_DEMO_MODE | NEXT_PUBLIC_DATA_SOURCE | Auth | School data |
|---|---|---|---|
| unset / anything but "false" | any | demo (any non-empty password, local account state) | browser store (`lumina-school:v1` localStorage) |
| "false" | unset | real JWT login | browser store |
| "false" | "api" | real JWT login | API via `/school/bootstrap` + `lib/school/api/*` |

Other frontend env: `NEXT_PUBLIC_API_URL`. Env names only — see `frontend/.env.example`.

## Where the flags are used

- `frontend/app/components/LuminaApp.tsx`: `booting` state, `effectiveAccount` (demo account vs `accountForUser(authUser)`), demo-only local state. Known wart: `studentCredits` is local state seeded at `24` (matches the demo seed); real balance should come from the credits service/ledger. `SCHOOL_SCHEMA_VERSION` 3: stale demo stores re-seed.
- `frontend/app/lib/school/services/*`: each service branches on `isApiDataMode()`; API branch calls `lib/school/api/*`, local branch calls `updateSchool(draft => ...)`.
- `frontend/app/lib/school/store.ts`: `dataSource` `"local" | "api"`.

## Rules to keep mock data out of production calls

1. Gate every new data path with `isApiDataMode()`; the API branch must not read `lib/school/seed.ts`, `data.ts`, or localStorage.
2. Never send demo-store ids (generated locally) to the API; resolve real ids from the bootstrap payload (e.g. `slotIdFor` in `lib/school/api/bookings.ts`).
3. Production/Vercel deploy must set `NEXT_PUBLIC_DEMO_MODE=false` and `NEXT_PUBLIC_DATA_SOURCE=api` explicitly (demo is the default!).
4. Auth and data flags are separate on purpose so each can be verified alone; demo sign-in forces the local store even if the data flag is `api`.

## Demo accounts (`@lumina.school`)

admin@ (Jamie Smith), manager@ (Priya Raman), manager2@ (Marco Bianchi), teacher@ (Alex Johnson), student@ (Mia Chen). Demo UI accepts any non-empty password; API mode password `Password123!` (seeded by `npm run db:seed`). "Reset demo workspace" in Settings only reseeds the browser store.

Progress of the cutover: `frontend/CUTOVER_PROGRESS.md` (Step A, B0-B2 done; B3 domain slices next).
