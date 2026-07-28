# Manual test matrix results — `/zetlify`

Run in a scratch Logseq graph (Developer mode, Load unpacked plugin pointed at
this repo's root). Record pass/fail per PLAN.md §7.

| # | Input block state | Expected result | Status |
|---|---|---|---|
| 1 | Block with content, no children | New page named `yyyymmddhhmmssxx`; page's first block = the content; original block becomes `{{embed [[<name>]]}}`. | ⬜ Not yet run |
| 2 | Block with content + several children | Content = first block on page; children moved below it in original order; original → embed; no empty stray block. | ⬜ Not yet run |
| 3 | Empty block with children | Children moved to page (no leading empty block); original → embed. | ⬜ Not yet run |
| 4 | Empty block, no children | Page created (single empty block ok); original → embed. | ⬜ Not yet run |
| 5 | Child block referenced elsewhere via `((uuid))` | After zetlify, the `((uuid))` ref still resolves (UUID preserved by moveBlock). | ⬜ Not yet run |
| 6 | Invoke twice quickly on two different blocks | Two different page names; two correct embeds. | ⬜ Not yet run |
| 7 | Block whose content is already `[[a link]]` | Content copied verbatim to page first block (no double-bracketing corruption). | ⬜ Not yet run |
| 8 | Collapsed block with children | Embed renders (collapsed property removed). | ⬜ Not yet run |

## Notes
- These require a real Logseq desktop instance in Developer mode; they cannot
  be automated in this sandboxed environment. Run this matrix manually before
  tagging a release, and update the Status column with ✅/❌ plus any notes.
- Code-level verification already done in this environment:
  - `pnpm typecheck` — pass.
  - `pnpm build` — pass, produces `dist/index.html` + JS bundle.
  - `scratch-timestamp.mjs` — pass, confirms `makeTimestampName` format and the
    documented example (`2026-02-06T09:32:45.107` → `2026020609324510`).
