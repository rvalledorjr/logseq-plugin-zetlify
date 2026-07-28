# Backlog — items from PLAN.md not carried out as planned

This sprint's implementation (code, scaffold, CI configs, docs) is complete and
committed (`origin/main` @ `b689a99`). The items below are the parts of the
plan's Definition of Done (§10) that could **not** be executed in the
implementation environment (a headless sandbox with no Logseq desktop app,
and no authority/desire to push release tags without user sign-off), and thus
remain open.

## 1. Manual test matrix (§7) — not run

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

## 2. CI verification (§8) — not confirmed

**Why:** The commit was pushed to `origin/main`, which should trigger
`build.yml` on GitHub Actions, but this session never checked the Actions
tab/API to confirm the run went green. No version tag (`v0.0.1` or similar)
was pushed, so `publish.yml` has never executed — tagging a release is a
user-facing action with real side effects (public GitHub Release, asset
artifacts) that shouldn't happen without explicit sign-off.

**To close:**
- Check `https://github.com/rvalledorjr/logseq-plugin-zetlify/actions` for the
  `build.yml` run on the `b689a99` push; confirm green.
- `git tag v0.0.1 && git push origin v0.0.1`, confirm `publish.yml` creates a
  Release with `logseq-plugin-zetlify.zip` + `package.json` attached.
- Download the zip and confirm it unpacks to `dist/`, `package.json`,
  `icon.png`, `README.md` (per §8 verification steps).

## 3. `icon.png` is a functional placeholder, not a real icon

**Why:** `image_generate` failed (FalClientHTTPError) when asked for a
clock/document icon. Rather than block the sprint on image-gen infra, a
flat 128×128 solid-blue PNG was generated programmatically in Python as a
placeholder — it satisfies the "any 128×128 PNG placeholder is fine" note in
PLAN.md §1 step 5, but is not a designed icon.

**To close:** Not blocking for this sprint (plan explicitly allows a
placeholder). Replace before any marketplace submission, along with the
README's placeholder screenshot/GIF (already flagged there per PLAN.md §9).

## 4. Toolchain version drift from plan

**Why:** The plan assumes Node 20/22 LTS. The actual sandbox had Node
v25.8.0 pre-installed via `mise`, and `pnpm` was not present — `corepack`
was also broken under `mise` (no default shim version configured). Installed
pnpm globally via `npm install -g pnpm` instead of the planned
`corepack prepare pnpm@latest --activate` flow. Everything still built and
typechecked cleanly on Node 25, so this was not treated as a blocker, but it's
a deviation worth noting since CI (`build.yml`) pins Node 20 — if anything is
sensitive to the exact toolchain, local dev and CI are not on identical
versions.

**To close:** No action required unless CI fails for Node-version reasons;
if it does, revisit local Node version to match CI's `20`.

## 5. `pnpm-workspace.yaml` appeared unexpectedly

**Why:** Not part of the plan's file layout (Appendix), but pnpm 11 appears
to auto-generate this file on `pnpm install` in some configurations. It was
committed alongside everything else without investigation into why it was
created or whether it's needed.

**To close:** Low priority — verify whether `pnpm-workspace.yaml` is
necessary; if it serves no purpose (single-package repo, no workspace globs),
consider removing it and re-running `pnpm install` to confirm nothing breaks.
