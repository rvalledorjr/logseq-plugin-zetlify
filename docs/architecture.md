# Architecture & design decisions

See the [README's "Why" section](../README.md#why) for the product rationale
(Zettelkasten-style capture, deferred naming, page-level portability) behind
these decisions.

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
- **Tier 2** (`e2e/`) — Playwright + `_electron` + `Xvfb` against a real, pinned Logseq
  desktop (`LOGSEQ_VERSION` in `e2e.yml`). It boots Logseq in an isolated `--user-data-dir`
  (never touches the developer's real graphs), opens a throwaway graph, loads the built
  `dist/` plugin via `LSPluginCore.register`, invokes the real `/zetlify` slash command,
  and asserts on the resulting graph markdown on disk + the live block API. Covers what
  the mock can't (real `moveBlock` UUID semantics, real command registration, the real
  embed transform). Heavier/flakier, so it runs rarely — pre-release only, as the publish
  gate. All 8 §7 rows pass. Harness: `e2e/harness.ts`; discovery notes in
  `.sprint/ci-cd-test-enforcement/RESULTS.md`.

Semantic-release is deliberately **not** used — it adds commit-convention overhead the
marketplace doesn't require.

## Toolchain pinning

The project pins its toolchain so local and CI converge on the same versions and the
version drift that used to break local runs can't recur:

- **`package.json` `"packageManager": "pnpm@9.15.9"`** — Corepack selects exactly this
  pnpm regardless of what's installed globally. Run pnpm via Corepack (`corepack pnpm …`,
  or just `pnpm …` with Corepack enabled) and you always get the right version. CI's
  `pnpm/action-setup` reads this field too (no hardcoded `version:`), so package.json is
  the single source of truth.
- **`package.json` `"engines"`** (`node >=20`, `pnpm >=9 <10`) + **`.npmrc`
  `engine-strict=true`** — a wrong Node/pnpm hard-fails instead of silently warning.
- **`.tool-versions`** (`node 20.20.2`) — mise/asdf users get the CI-matching Node
  automatically, overriding any global default.

Why pnpm **9** specifically: the committed `pnpm-lock.yaml` is lockfileVersion 9.0, and
pnpm 9 has no build-script approval gate. pnpm 10+ prompts on esbuild's postinstall and
writes a local-only `pnpm-workspace.yaml` (an approvals cache with no `packages:` key)
that pnpm 9 in CI then rejects during `pnpm store path`. Pinning to pnpm 9 eliminates
that file at the source — it's no longer generated, so the old gitignore workaround for
it is moot. If you ever see a stray `pnpm-workspace.yaml` locally, you're running the
wrong pnpm; check `corepack pnpm --version` returns 9.x.
