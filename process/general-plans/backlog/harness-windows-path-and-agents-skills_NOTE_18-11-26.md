---
name: note:harness-windows-path-and-agents-skills
description: "Backlog: three audit validators mis-handle Windows path separators, and .agents/skills is a committed duplicate tree instead of the documented symlink"
date: 18-11-26
---

# Harness audits on Windows

status: open
item: found during Step C UPDATE PROCESS (2026-11-18), not caused by Step C
reason: All three findings live in kit-managed code/docs (`.claude/skills/**`, `AGENTS.md`), so a local
edit would diverge from the remote kit; they should be fixed upstream and pulled with `vc-update`.

## Findings

1. **Windows path separators (3 validators).** Kit scripts build paths with `path.join`, which yields
   `process\context\...` on Windows, while the checks compare against forward-slash literals or split
   on `/`.
   - `vc-audit-context/scripts/validate-context-discovery.mjs` (`walk` + `replace(/^process\/context\//)`)
     reports every context doc as "not indexed by all-context.md or its group entrypoint" (16/16 docs).
   - `vc-context-discovery/scripts/discover-context.mjs` (`groupOf` + `/(^|\/)all-[^/]+\.md$/`)
     finds 0 group entrypoints, so `--emit-routing` writes an empty table and `--check-routing`
     always reports the routing block STALE.
   - `vc-audit-plans/scripts/validate-plan-inventory.mjs` (`file.includes("/active/")`) always reports
     `activePlans: 0, completedPlans: 0`, so it passes vacuously instead of scanning plans.
   - Fix shape: normalize to POSIX inside `walk` (`rel.split(path.sep).join("/")`) and in `groupOf`,
     or use `path.posix` comparisons.
2. **`.agents/skills` is not a symlink.** `AGENTS.md` describes it as a symlink to `.claude/skills`, and
   `validate-context-discovery.mjs` asserts `realpath(.agents/skills) === realpath(.claude/skills)`.
   In this checkout git tracks `.agents/skills` as regular files (mode `100644`, 339 files) and
   `core.symlinks` is `false`. The two trees were byte-identical on 2026-11-18, so nothing is broken
   today, but every `.claude/skills` edit must be mirrored by hand.
   - Fix options: enable symlinks and replace the duplicate tree with a real link (needs a
     Windows-capable checkout path), or keep the duplicate tree and update `AGENTS.md` plus the
     validator's parity assertion so the documented shape matches reality.
3. **Root router heading must follow frontmatter immediately.** `vc-generate-context/scripts/validate-all-context.mjs`
   strips frontmatter with `/^---\n[\s\S]*?\n---\n/` and then requires `^#\s`, so a blank line between
   `---` and the `#` heading fails "missing top-level heading". `process/context/all-context.md` now has
   frontmatter with no blank line before its heading (other context docs keep the blank line; only the
   root file is validated).

## Verified state (2026-11-18)

- `validate-context-discovery.mjs`: warnings 0 (after backfilling `keywords` on `all-context.md`,
  `tests/all-tests.md`, `planning/all-planning.md`); failures are exactly findings 1 and 2.
- `discover-context.mjs --check-routing`: fails on Windows only; a POSIX-normalized replica of the
  generator reproduces the on-disk block byte-for-byte (5 group entrypoints, correct descriptions).
- `validate-plan-inventory.mjs`: exits 0; the real inventory is 0 active plans and 2 completed plans.
- `validate-all-context.mjs` and `validate-protocol-discovery.mjs` (22 protocol docs): clean.

## Next step

NEW PLAN REQUIRED only if the kit is to be fixed locally; otherwise upstream the `walk`/`groupOf`
normalization and the `.agents/skills` decision to the remote kit repo (`vc-publish`), then `vc-update`.
