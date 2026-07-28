# Architecture & design decisions

## Stack

Vite + TypeScript + pnpm + `vite-plugin-logseq`, no UI framework. Zetlify has
zero UI — it's a slash command that mutates blocks — so React/Tailwind would
be dead weight even though they're the ecosystem's general template
recommendation. The modern build core (Vite, TypeScript, pnpm) is kept; the
UI layer is dropped.

## Page naming

Pages are named with a timestamp in the format `yyyymmddhhmmssxx` (24-hour
clock, `xx` = centiseconds — `floor(milliseconds / 10)`, zero-padded to 2
digits), e.g. `2026020609324510`. This is deliberately simple, and is backed
by a uniqueness guard (`makeUniquePageName` in `src/timestamp.ts`) that probes
`logseq.Editor.getPage` and bumps the candidate name if a collision is found,
so two rapid invocations never collide.

## Block move semantics

The invoked block's own content is *copied* onto the new page's first block,
while its children are *moved* (via `logseq.Editor.moveBlock`) so their UUIDs
— and any existing `((block-ref))`s to them — are preserved. The original
block is kept in place and rewritten to `{{embed [[<page name>]]}}`, so its
own UUID persists as the embed host. This is the intended
Zettelkasten-style behavior: reference integrity survives the split.

## CI/CD

Two workflows implement the Logseq marketplace's publishing contract, and a two-tier
test gate enforces the §7 acceptance matrix so a release cannot ship untested core
functionality:

- `.github/workflows/build.yml` — runs `pnpm install --frozen-lockfile`,
  `pnpm typecheck`, **`pnpm test`** (Tier 1), `pnpm build` on every push/PR as a fast
  breakage + regression check. Intended to be a required status check on `main`.
- `.github/workflows/e2e.yml` — Tier 2: drives a real, pinned Logseq desktop instance
  under `Xvfb` via Playwright's Electron support, running the 8-row matrix against the
  actual API and command palette. Runs on `workflow_dispatch` and is `workflow_call`-ed
  by `publish.yml`.
- `.github/workflows/publish.yml` — on a `v*` tag, its `build` job `needs:` the Tier 2
  `e2e` job, so **no Release is created unless Tier 2 passed for that commit** (fails
  closed). It then packages `dist/`, `package.json`, `icon.png`, `README.md` into a zip
  and attaches it to a GitHub Release — the zip-on-tag shape the
  [Logseq marketplace](https://github.com/logseq/marketplace) requires.

**Two-tier testing:**
- **Tier 1** (`test/`) — Vitest + an in-memory fake of `logseq.Editor.*` exercises the
  real `zetlify()`/`makeUniquePageName()` logic, one test per matrix row. Milliseconds
  per run, no Electron. Catches logic regressions on every commit. The fake is a
  minimal *assumption* about Logseq's API, not ground truth.
- **Tier 2** (`e2e/`) — Playwright + `_electron` + `Xvfb` against real Logseq, asserting
  via Logseq's HTTP APIs server / a markdown diff of the graph. Covers what the mock
  can't (real `moveBlock` UUID semantics, real command registration, real embed
  rendering). Heavier/flakier, so it runs rarely — pre-release only, as the publish gate.

Semantic-release is deliberately **not** used — it adds commit-convention overhead the
marketplace doesn't require.

## Known local-tooling gotcha

`pnpm-workspace.yaml` is not part of this project's file layout. pnpm 11
auto-writes it locally (no `packages:` key) when you run `pnpm approve-builds`
to allow a dependency's postinstall script (e.g. esbuild). It's gitignored
because CI's pinned pnpm 9 treats a `packages:`-less workspace file as
invalid and fails `pnpm store path` during cache setup. If you hit an odd
CI-only pnpm failure, check for this file first.
