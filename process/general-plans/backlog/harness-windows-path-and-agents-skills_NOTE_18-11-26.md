---
name: note:harness-windows-path-and-agents-skills
description: "Backlog: Windows path bugs in kit validators (locally fixed 18-11-26) plus the .agents/skills duplicate tree and the README guide-sync mismatch"
date: 18-11-26
---

# Harness audits on Windows

status: done-with-gap
item: found during Step C UPDATE PROCESS (2026-11-18); Windows path fixes applied during D1 UPDATE PROCESS (2026-11-18)
reason: The path bugs were in kit-managed scripts, so the local fix diverges from the remote kit and should be upstreamed. The `.agents/skills` shape and the README catalog assumption are still open.

## Findings

1. **Windows path/line-ending bugs in kit scripts (6 files) — FIXED LOCALLY 2026-11-18.** Kit scripts
   built root-relative paths with `path.join`, which yields `process\context\...` on Windows, while
   the checks compare against forward-slash literals, split on `/`, or match `/active/`; two more
   scripts assumed LF line endings or scanned folder guides as documents.
   - `vc-audit-context/scripts/validate-context-discovery.mjs` — `walk` + frontmatter parsing;
     previously reported every nested context doc as "not indexed" and flagged the routing block
     stale. Also skipped the root router when building the `related` slug registry, so
     `related: [context:all-context]` always looked dangling, and its frontmatter parser only
     accepted LF line endings.
   - `vc-context-discovery/scripts/discover-context.mjs` — `walk`, `groupOf`, and the `--feature`
     subfolder split; previously found 0 group entrypoints, so `--emit-routing` wrote an empty
     table that `--check-routing` then reported as stale.
   - `vc-audit-plans/scripts/validate-plan-inventory.mjs` — `walk`; previously reported
     `activePlans: 0, completedPlans: 0`, so it passed vacuously instead of scanning plans. Also
     now filters to files whose basename contains `PLAN`, so `_GUIDE.md`/`REPORT`/`SPEC` files are
     not scored as plans.
   - `vc-audit-vc/scripts/validate-protocol-wiring.mjs` — `walk`; previously warned that every
     agent's `process/development-protocols/*.md` reference "does not exist". With the path fixed it
     exposed real drift: `all-development-protocols.md` did not index the 12
     `vc-system-behavior/*.md` files (now it does, and it no longer cites a non-existent
     `archive/` copy of the monolith).
   - `vc-generate-context/scripts/validate-all-context.mjs` — frontmatter strip only accepted LF, so
     a CRLF checkout made the root router look like it had no top-level heading.
   - `vc-audit-plans/scripts/validate-backlog-notes.mjs` — scanned `_GUIDE.md` folder guides as
     backlog notes and demanded `status`/`item`/`reason` fields from them.
   - Fix shape applied: `path.posix.join` inside `walk`, `/` splits, CRLF-tolerant frontmatter and
     routing comparison, router included in the `related` registry, `_`-prefixed guides skipped.
     Mirrored to the `.agents/skills` copy of each file.
   - Upstream: send these six patches to the kit repo with `vc-publish`, then pull with `vc-update`.

2. **`.agents/skills` is not a symlink — STILL OPEN.** `AGENTS.md` used to describe it as a symlink
   to `.claude/skills`, and `validate-skills.mjs` asserts
   `realpath(.agents/skills) === realpath(.claude/skills)`. In this checkout git tracks
   `.agents/skills` as regular files (mode `100644`, 339 files, `core.symlinks` is `false`). The two
   trees were byte-identical on 2026-11-18, so nothing is broken today, but every `.claude/skills`
   edit must be mirrored by hand.
   - Done: `AGENTS.md` now states the real shape and the mirroring rule.
   - Remaining: `validate-skills.mjs` will keep reporting this until the tree becomes a real
     symlink (needs a symlink-capable checkout) or the validator learns to accept a byte-identical
     copy.

3. **Root router heading must follow frontmatter immediately — FIXED LOCALLY 2026-11-18.**
   `vc-generate-context/scripts/validate-all-context.mjs` now strips frontmatter with
   `/^---\r?\n[\s\S]*?\r?\n---\r?\n/`, so a CRLF checkout no longer makes `all-context.md` look like
   it is missing its heading. The "no blank line before the heading" convention is unchanged.

4. **`validate-guide-sync.mjs` is not applicable here — STILL OPEN (documentation).** It expects a
   skill catalog in the root `README.md`, but this repo's README is the product readme (requirements,
   setup, scripts, API, demo accounts) and has no skill/agent section; harness docs live in
   `AGENTS.md`/`CLAUDE.md`. The check reports 10+ skills "missing from README.md skill catalog"
   because no catalog exists. Either add a catalog section or teach the validator that this repo
   documents skills elsewhere.

## Verified state (2026-11-18, D1 UPDATE PROCESS)

- `validate-context-discovery.mjs`: 16 docs, 266 concrete refs, 0 warnings; only failure is
  finding 2.
- `discover-context.mjs --check-routing`: in sync (5 group entrypoints, POSIX paths).
- `validate-plan-inventory.mjs`: real scan — 0 active plans, 3 completed plans, 0 samples, clean
  under `--strict`.
- `validate-protocol-wiring.mjs`: 22 protocols, 15 agents, 0 warnings, 0 failures.
- `validate-all-context.mjs`: 0 failures, 0 warnings.
- `validate-backlog-notes.mjs` (feature and general backlog): 0 failures.
- `validate-guide-sync.mjs`: still red — finding 4.
- `validate-skills.mjs`: still red — finding 2.

## Next step

NEW PLAN REQUIRED only if the kit is to be fixed locally again; otherwise upstream the six patches
with `vc-publish`, then decide `.agents/skills` (real symlink vs validated copy) and the README
catalog question upstream so `vc-update` does not reintroduce the Windows failures.
