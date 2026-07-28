# Backlog — items from PLAN.md not carried out as planned

This sprint's implementation (code, scaffold, CI configs, docs) is complete and
committed (`origin/main` @ `b689a99`). The items below are the parts of the
plan's Definition of Done (§10) that could **not** be executed in the
implementation environment (a headless sandbox with no Logseq desktop app,
and no authority/desire to push release tags without user sign-off), and thus
remain open.

## 1. Manual test matrix (§7) — not run

**Dependency order:** 4th (of 5). Independent of the toolchain/CI chain below —
this validates plugin *behavior* in the real Logseq desktop app, not the build
pipeline. Not blocked by items 2/4/5, but a green CI build (item 2) is a
reasonable prerequisite before investing time here.

**Why:** The 8-row test matrix requires driving the real Logseq desktop app
(Developer mode → Load unpacked plugin → interactive block editing → visual
confirmation of embeds). The sprint was executed in a sandboxed terminal/file
environment with no Logseq desktop instance available. `test-results.md` was
scaffolded with all 8 rows in a "Not yet run" state, ready for a human (or a
browser-automation subagent driving Logseq desktop/web, if that becomes
available) to fill in.

**What was substituted:** Pure-logic verification only —
`scratch-timestamp.mjs` confirms `makeTimestampName` produces the exact
documented example (`2026-02-06T09:32:45.107` → `2026020609324510`, 16 chars).
This covers zero of the Logseq-API-dependent behavior (page creation, block
moves, UUID preservation, embed rendering, collision guard against a live
graph).

**To close:** Open Logseq, enable Developer mode, load this repo unpacked,
run all 8 rows from PLAN.md §7, update `test-results.md` with ✅/❌ per row.

## 2. CI verification (§8) — build.yml confirmed green; tag/publish still open

**Dependency order:** 3rd (of 5). Depended on items 4 and 5 — CI (`build.yml`)
pins Node 20 while local dev used Node 25 (item 4), and the committed
`pnpm-workspace.yaml` (item 5) was untested against CI's install path.

**Update (this pass):** Checked the Actions API and found `build.yml` had
actually been **failing** on both prior pushes (`b689a99`, `5e23d1e`) —
`pnpm store path` errored with `ERROR packages field missing or empty`
because the committed `pnpm-workspace.yaml` (item 5) has no `packages:` key,
which pnpm 9 (CI's pinned version) treats as invalid. Root-caused, fixed, and
verified: see item 5 below. After removing the file (commit `266927a`,
pushed to `origin/main`), `build.yml` run
[30325810789](https://github.com/rvalledorjr/logseq-plugin-zetlify/actions/runs/30325810789)
passed — `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build` all
green. Node-version drift (item 4) turned out to be a non-issue: CI runs Node
20 fine once the workspace file is gone.

**Still open:** No version tag has been pushed, so `publish.yml` has never
executed — tagging a release is a user-facing action with real side effects
(public GitHub Release, asset artifacts) that shouldn't happen without
explicit sign-off.

**To close:**
- `git tag v0.0.1 && git push origin v0.0.1`, confirm `publish.yml` creates a
  Release with `logseq-plugin-zetlify.zip` + `package.json` attached.
- Download the zip and confirm it unpacks to `dist/`, `package.json`,
  `icon.png`, `README.md` (per §8 verification steps).

## 3. `icon.png` is a functional placeholder, not a real icon

**Dependency order:** 5th (of 5) — fully independent leaf. Cosmetic only, no
bearing on build/CI/test outcomes; least foundational item, purely
pre-marketplace polish.

**Why:** `image_generate` failed (FalClientHTTPError) when asked for a
clock/document icon. Rather than block the sprint on image-gen infra, a
flat 128×128 solid-blue PNG was generated programmatically in Python as a
placeholder — it satisfies the "any 128×128 PNG placeholder is fine" note in
PLAN.md §1 step 5, but is not a designed icon.

**To close:** Not blocking for this sprint (plan explicitly allows a
placeholder). Replace before any marketplace submission, along with the
README's placeholder screenshot/GIF (already flagged there per PLAN.md §9).

## 4. Toolchain version drift from plan — investigated, not the actual CI blocker

**Dependency order:** 1st (of 5) — root cause hypothesis. Suspected as the
environment deviation the others trace back to.

**Why:** The plan assumes Node 20/22 LTS. The actual sandbox had Node
v25.8.0 pre-installed via `mise`, and `pnpm` was not present — `corepack`
was also broken under `mise` (no default shim version configured). Installed
pnpm globally via `npm install -g pnpm` instead of the planned
`corepack prepare pnpm@latest --activate` flow. Everything still built and
typechecked cleanly on Node 25.

**Update (this pass):** Confirmed via a green `build.yml` run
([30325810789](https://github.com/rvalledorjr/logseq-plugin-zetlify/actions/runs/30325810789))
that Node 20 (CI) vs Node 25 (local sandbox) is **not** a source of
incompatibility — the actual CI failure was item 5's `pnpm-workspace.yaml`,
unrelated to Node version. No action needed; closing as investigated/cleared.

**To close:** Done — no action required. Local Node 25 vs CI Node 20 has no
observed effect on this project.

## 5. `pnpm-workspace.yaml` appeared unexpectedly — root cause found, fixed, verified

**Dependency order:** 2nd (of 5). Turned out to be **the actual cause of the
CI failures** flagged in item 2, not merely a cosmetic side effect of item 4.

**Why:** Not part of the plan's file layout (Appendix). It's a *local-only*
artifact that pnpm 11 auto-writes (`allowBuilds: { esbuild: true }`) when you
run `pnpm approve-builds` to allow a dependency's postinstall script — it has
no `packages:` key, so it isn't a real workspace manifest, just an
approvals cache. It was committed alongside everything else without
investigation.

**Update (this pass):** Confirmed via GitHub Actions logs that this file was
the actual cause of both prior `build.yml` failures: CI's pnpm 9 (pinned via
`pnpm/action-setup@v4`) runs `pnpm store path` during its cache-setup step,
which errors `ERROR packages field missing or empty` when it finds a
`pnpm-workspace.yaml` lacking `packages:`. Fixed by:
- `git rm --cached pnpm-workspace.yaml` (removed from the repo)
- Added `pnpm-workspace.yaml` to `.gitignore` with a comment explaining why,
  so it can regenerate locally without being re-committed
- Verified locally: fresh `rm -rf node_modules pnpm-lock.yaml dist` +
  `pnpm install` + `pnpm run typecheck` + `pnpm run build` all pass without
  the file (after `pnpm approve-builds esbuild` once, locally, to allow the
  postinstall script — this is a one-time local dev-machine step, not needed
  in CI since CI pins pnpm 9 which doesn't have this approval gate)
- Pushed as commit `266927a`; confirmed `build.yml` run
  [30325810789](https://github.com/rvalledorjr/logseq-plugin-zetlify/actions/runs/30325810789)
  passed end-to-end (install, typecheck, build all green)

**To close:** Done.
