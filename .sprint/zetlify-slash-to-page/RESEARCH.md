# Research & Decisions — Zetlify plugin

This file records *why* the plan is shaped the way it is, and where the CI/CD and
tooling choices come from. Read this once before starting; it is not a task list.
All findings verified against live sources on the date this sprint was opened.

## Sources consulted (all currently maintained / official)

| Source | What we took from it | URL |
|---|---|---|
| Logseq official plugin samples repo | Prerequisites, "keep `@logseq/libs` as up-to-date as possible", node 20/22 via nvm | https://github.com/logseq/logseq-plugin-samples |
| Logseq official marketplace README | The **authoritative** publishing contract: repo must ship a `publish.yml` that builds a zip on tag/release; `manifest.json` fields; release must attach a zip asset | https://github.com/logseq/marketplace |
| `pengx17/logseq-plugin-template-react` (template linked from ecosystem docs) | Modern build stack: **Vite + `vite-plugin-logseq` + pnpm**, `dist/index.html` as `main`, `logseq` block in package.json | https://github.com/pengx17/logseq-plugin-template-react |
| `hyrijk/logseq-plugin-block-to-page` (the product's reference) | Concrete API usage: `registerSlashCommand`, `getBlock({includeChildren})`, `createPage`, `moveBlock`, `getPageBlocksTree`, empty-page write pitfall | https://github.com/hyrijk/logseq-plugin-block-to-page |
| `sawhney17/logseq-schrodinger` (actively maintained, in marketplace) | A real-world, tag-triggered `publish.yml` shape we modernize | https://github.com/sawhney17/logseq-schrodinger |
| npm `@logseq/libs` | Latest published version at sprint open: **0.0.17** | https://www.npmjs.com/package/@logseq/libs |

## Key decisions

1. **No React / no UI framework.** Zetlify has zero UI — it is a slash command that
   mutates blocks. The React template is the team's *general* recommendation, but
   pulling in React/Tailwind here is dead weight. We keep the template's *modern
   build core* (Vite + `vite-plugin-logseq` + TypeScript + pnpm) and drop React.
   This is still "the current recommendation", just without the UI layer we don't use.

2. **CI/CD = marketplace's required `publish.yml` contract.** The marketplace README
   is the single source of truth for how a plugin must publish. It requires a
   `publish.yml` that, on a tag/release, builds and attaches a `.zip`. We implement
   exactly that, modernizing action versions (checkout@v4, setup-node@v4, pnpm/action-setup@v4,
   ncipollo/release-action@v1). We deliberately do **not** adopt semantic-release
   (the React template uses it) — it adds commit-convention overhead that is not
   required by the marketplace and is noise for an iterative solo/small project.
   A second lightweight `build.yml` runs on PRs/pushes to catch build breakage early.

3. **Page name = timestamp `yyyymmddhhmmssxx`.** `xx` = centiseconds (hundredths of a
   second), i.e. `floor(milliseconds / 10)` zero-padded to 2 digits. This is the
   "simplistic collision fix" the product asks for. We *additionally* guard with a
   uniqueness loop (see PLAN step 5) because two invocations inside the same 10ms
   window, or re-running on an already-taken name, are still possible.

4. **Preserve child references by MOVING, copy the parent's own content.**
   Child blocks are relocated with `moveBlock` so their UUIDs — and any existing
   `((block-ref))`s to them — survive. The invoked block's *own* content becomes the
   first block on the new page (a copy), while the invoked block itself is kept in
   place and rewritten to the embed, so its UUID persists as the embed host. This is
   the correct Zettelkasten behavior and is called out explicitly in the plan.
