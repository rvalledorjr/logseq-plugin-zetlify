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

Two workflows implement the Logseq marketplace's publishing contract:

- `.github/workflows/build.yml` — runs `pnpm install --frozen-lockfile`,
  `pnpm typecheck`, `pnpm build` on every push/PR as a fast breakage check.
- `.github/workflows/publish.yml` — on a `v*` tag, builds and packages
  `dist/`, `package.json`, `icon.png`, `README.md` into a zip and attaches it
  to a GitHub Release. This exact shape (zip-on-tag) is what the
  [Logseq marketplace](https://github.com/logseq/marketplace) requires for
  submission.

Semantic-release is deliberately **not** used — it adds commit-convention
overhead the marketplace doesn't require.

## Known local-tooling gotcha

`pnpm-workspace.yaml` is not part of this project's file layout. pnpm 11
auto-writes it locally (no `packages:` key) when you run `pnpm approve-builds`
to allow a dependency's postinstall script (e.g. esbuild). It's gitignored
because CI's pinned pnpm 9 treats a `packages:`-less workspace file as
invalid and fails `pnpm store path` during cache setup. If you hit an odd
CI-only pnpm failure, check for this file first.
