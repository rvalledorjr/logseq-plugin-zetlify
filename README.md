# logseq-plugin-zetlify

Turn any block — with or without children — into its own timestamp-named page,
and replace the original block with an embed pointing at it.

> TODO: add a real GIF/screenshot before any marketplace submission.

## What it does

Typing `/zetlify` in any block and invoking it will:

1. Create a new page named with a timestamp, e.g. `2026020609324510`
   (format `yyyymmddhhmmssxx`, 24-hour clock, `xx` = centiseconds).
2. Move the invoked block's own content onto the new page as its first block.
3. Move the invoked block's children onto the new page (in order), preserving
   their UUIDs so existing block references keep working.
4. Rewrite the original block in place as `{{embed [[<page name>]]}}`.

Two rapid invocations are guaranteed to never collide on the same page name.

## Install (unpacked, for development / before marketplace listing)

1. Clone this repo and install dependencies:
   ```bash
   pnpm install
   pnpm build
   ```
2. In Logseq: **Settings → turn on Developer mode**.
3. Open the plugins dashboard (`t p` or via the toolbar) → **Load unpacked plugin**
   → select this repo's root directory (the one containing `package.json`).
4. In any block, type `/zetlify` and select **Zetlify**.

## Development

```bash
pnpm dev        # Vite dev server with HMR via vite-plugin-logseq
pnpm typecheck  # tsc --noEmit
pnpm build      # production build into dist/
```

## Documentation

See [`docs/architecture.md`](docs/architecture.md) for design decisions
(stack choice, page-naming scheme, block move semantics, CI/CD).

## License

MIT
