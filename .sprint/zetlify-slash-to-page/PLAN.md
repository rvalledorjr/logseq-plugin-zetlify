# Sprint Plan — Zetlify: `/zetlify` slash command → timestamp page + embed

**Audience:** a medior developer. You know TypeScript, git, and CI basics.
You have *not* necessarily written a Logseq plugin before — this plan gives you
the exact API calls and pitfalls so you don't have to reverse-engineer them.

**Repo:** `logseq-plugin-zetlify` (this repo, currently empty except README + git).
**Read first:** `RESEARCH.md` in this same folder — it explains *why* the stack and
CI are chosen. This file is the *what/how*.

> **Implementation status:** Code, scaffold, and CI configs are implemented and
> pushed (commit `b689a99`). Several DoD items (§10) remain open because they
> require a live Logseq desktop instance or a pushed release tag, neither of
> which was available/appropriate in the implementation sandbox. See
> `BACKLOG.md` in this same folder for the itemized list of what's outstanding
> and why, and §10 below for the checklist with per-item status.

**Working files rule:** Any scratch files, notes, spikes, screenshots, or generated
artifacts you produce while executing this plan go **inside this same directory**
(`.sprint/zetlify-slash-to-page/`). Do not scatter them elsewhere in the repo.

---

## 0. What we are building (acceptance criteria)

The plugin is "done" for this sprint when **all** of the following are true:

1. In Logseq desktop (Developer mode), typing `/zetlify` in any block shows a
   slash command labeled **Zetlify**.
2. Invoking it on a block — **with or without content, with or without children** —
   creates a **new page** whose title is a timestamp `yyyymmddhhmmssxx`
   (24-hour `hh`, `xx` = centiseconds). Example: `2026020609324510`.
3. The invoked block's **own content** (if any) becomes the first block of the new page.
4. The invoked block's **children** are moved (not copied) onto the new page, preserving
   their UUIDs so any existing block references keep working.
5. The **original invoked block** is rewritten in place to a page embed pointing at the
   new page: `{{embed [[2026020609324510]]}}` — and it has no leftover children.
6. Two rapid invocations never collide on the same page name.
7. `pnpm build` produces a loadable `dist/` that Logseq can "Load unpacked plugin".
8. Pushing a git tag `v*` triggers CI that builds and attaches a `.zip` release asset
   shaped exactly as the Logseq marketplace expects.

Non-goals (do **not** build): settings UI, config options, DB-graph-specific handling,
undo/redo, batch conversion, marketplace PR submission. Iterative — later sprints.

---

## 1. Toolchain & scaffold

Target: **Vite + TypeScript + pnpm + `vite-plugin-logseq`**, no React (see RESEARCH §1).

### Steps
1. Ensure Node 20 LTS (or 22) and `pnpm` are available:
   ```bash
   node -v      # expect v20.x or v22.x
   corepack enable && corepack prepare pnpm@latest --activate
   pnpm -v
   ```
2. Create `package.json` (see exact content in §2).
3. Install deps:
   ```bash
   pnpm add @logseq/libs@^0.0.17
   pnpm add -D vite@^5 vite-plugin-logseq typescript@^5 @types/node
   ```
   > `@logseq/libs` latest is `0.0.17` at sprint open. If a newer version exists when
   > you run this, prefer it — the ecosystem explicitly asks plugins to stay current.
4. Create `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts` (§2).
5. Add an `icon.png` (any 128×128 PNG placeholder is fine for this sprint) at repo root.
6. `pnpm build` must produce `dist/index.html` + assets with no errors.

### Verification
- `dist/index.html` exists after build.
- Load unpacked `dist`'s parent (the repo root) in Logseq → plugin appears, no console errors.

---

## 2. Exact config files

### `package.json`
```jsonc
{
  "name": "logseq-plugin-zetlify",
  "version": "0.0.1",
  "description": "Turn a block and its children into a timestamp-named page and embed it in place.",
  "main": "dist/index.html",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit"
  },
  "license": "MIT",
  "dependencies": {
    "@logseq/libs": "^0.0.17"
  },
  "devDependencies": {
    "@types/node": "^20",
    "typescript": "^5",
    "vite": "^5",
    "vite-plugin-logseq": "^1.1.2"
  },
  "logseq": {
    "id": "logseq-plugin-zetlify",
    "icon": "./icon.png"
  }
}
```
> The `logseq.id` and `logseq.icon` keys are **required** for Logseq to recognize the
> plugin. `main` must point at the built HTML.

### `vite.config.ts`
```ts
import { defineConfig } from "vite";
import logseqDevPlugin from "vite-plugin-logseq";

export default defineConfig({
  plugins: [logseqDevPlugin()],
  build: {
    target: "esnext",
    minify: "esbuild",
  },
});
```

### `tsconfig.json`
```jsonc
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["esnext", "dom"],
    "types": ["node"]
  },
  "include": ["src", "vite.config.ts"]
}
```

### `index.html`
```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

### Verification
- `pnpm typecheck` passes.
- `pnpm build` passes.

---

## 3. Timestamp generator (`src/timestamp.ts`)

Pure, testable function — no Logseq API. Build this first, it's the easiest win.

**Format `yyyymmddhhmmssxx`:**
- `yyyy` full year, `mm` month 01–12, `dd` day, `hh` hour 00–23,
- `mm` minutes, `ss` seconds, `xx` = centiseconds = `floor(ms / 10)`, 2 digits.

```ts
export function makeTimestampName(d: Date = new Date()): string {
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  const centis = Math.floor(d.getMilliseconds() / 10); // 0..99
  return (
    d.getFullYear().toString() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +      // 24-hour
    p(d.getMinutes()) +
    p(d.getSeconds()) +
    p(centis)
  );
}
```

### Pitfalls
- `getMonth()` is 0-based → `+1`.
- Use local time (`getHours()`), matching how Logseq journal/dates are local. Do not
  use UTC getters.
- Output is always exactly 16 chars.

### Verification
- Quick sanity check via a scratch script inside this sprint folder, e.g.
  `.sprint/zetlify-slash-to-page/scratch-timestamp.mjs`, asserting length 16 and
  that `makeTimestampName(new Date('2026-02-06T09:32:45.107'))` → `2026020609324510`.

---

## 4. Uniqueness guard (`src/timestamp.ts`, added function)

Even with centiseconds, collisions are possible (same 10ms window, or re-run). Make the
name unique against existing pages by probing and bumping.

```ts
// Returns a page name guaranteed not to already exist.
export async function makeUniquePageName(): Promise<string> {
  let base = makeTimestampName();
  let candidate = base;
  let attempt = 0;
  // getPage returns null when the page doesn't exist.
  while ((await logseq.Editor.getPage(candidate)) !== null) {
    attempt += 1;
    // Regenerate from a fresh clock; if still colliding, append a counter.
    const fresh = makeTimestampName();
    candidate = fresh !== base ? fresh : `${base}${String(attempt).padStart(2, "0")}`;
    base = candidate;
    if (attempt > 50) throw new Error("zetlify: could not allocate unique page name");
  }
  return candidate;
}
```
> Keep `makeTimestampName` pure; this async function is the only one touching the API.

### Verification
- Covered by the manual double-invoke test in §7 (two embeds must point to two names).

---

## 5. Core command (`src/main.ts`)

This is the heart. Follow the sequence exactly — ordering matters because moving children
before reading them, or deleting the auto-created first block at the wrong time, corrupts state.

### Behavior sequence
1. Get the invoked block **with children**:
   ```ts
   const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
   if (!block) return;
   ```
2. Allocate a unique page name: `const pageName = await makeUniquePageName();`
3. Create the page (do **not** redirect the user away):
   ```ts
   await logseq.Editor.createPage(pageName, {}, { createFirstBlock: true, redirect: false });
   ```
   > `createFirstBlock: true` guarantees the page has one (empty) block we can target.
4. Get that first block on the new page:
   ```ts
   const pageBlocks = await logseq.Editor.getPageBlocksTree(pageName);
   const firstBlock = pageBlocks[0]; // exists because createFirstBlock: true
   ```
5. **Write the invoked block's own content** onto the first block (if it had content):
   ```ts
   const ownContent = (block.content ?? "").trim();
   if (ownContent.length > 0) {
     await logseq.Editor.updateBlock(firstBlock.uuid, ownContent);
   }
   ```
   Track a cursor UUID for appending children after this block:
   `let anchorUuid = firstBlock.uuid;`
6. **Move children** onto the page, in order, preserving UUIDs:
   ```ts
   const children = (block.children ?? []) as BlockEntity[];
   for (const child of children) {
     await logseq.Editor.moveBlock(child.uuid, anchorUuid, { children: false, before: false });
     anchorUuid = child.uuid; // keep sibling order
   }
   ```
   > `moveBlock` relocates the real block (UUID preserved) so existing `((refs))` survive.
   > `children: false` means "make it a sibling after the target", not a child of it.
7. **Handle the empty first block edge case.** If the invoked block had *no* own content
   *and* had children, the auto-created empty `firstBlock` is now a stray empty block
   above the moved children. Remove it:
   ```ts
   if (ownContent.length === 0) {
     await logseq.Editor.removeBlock(firstBlock.uuid);
   }
   ```
   > Do this **after** moving children (step 6 used it as the initial anchor). If there
   > were no children either, the page keeps a single empty block — acceptable (page still
   > exists and is embeddable).
8. **Rewrite the original block in place** to the embed. This keeps the original block's
   UUID as the embed host:
   ```ts
   await logseq.Editor.updateBlock(block.uuid, `{{embed [[${pageName}]]}}`);
   ```
9. The original block's children were *moved out* in step 6, so it now has none. Verify no
   stragglers; if any remain (shouldn't), that's a bug to investigate. Then:
   ```ts
   await logseq.Editor.exitEditingMode();
   ```
10. If the original block had a `collapsed` property, remove it so the embed renders:
    ```ts
    if (block.properties?.collapsed) {
      await logseq.Editor.removeBlockProperty(block.uuid, "collapsed");
    }
    ```

### Registration + error handling
```ts
import "@logseq/libs";
import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";
import { makeUniquePageName } from "./timestamp";

async function zetlify(uuid: string) {
  try {
    // steps 1–10 above
  } catch (err) {
    console.error("zetlify error", err);
    logseq.UI.showMsg(`Zetlify failed: ${(err as Error).message}`, "error");
  }
}

function main() {
  logseq.Editor.registerSlashCommand("Zetlify", async (e) => zetlify(e.uuid));
}

logseq.ready(main).catch(console.error);
```

### Pitfalls (learned from the reference plugin)
- **Cannot write blocks into a truly empty page.** Always use `createFirstBlock: true`
  and target the returned first block; don't try to insert into a page with zero blocks.
- `updateBlock` then removing/adding a property can *undo* the update in some Logseq
  versions. Order: update content first (step 8), property removal last (step 10),
  on the *original* block only.
- `moveBlock` order: iterate children in array order and advance the anchor each time,
  otherwise moved children end up reversed.
- Don't `redirect: true` on `createPage` — it yanks the user to the new page mid-operation.
- Use `logseq.UI.showMsg` (current API) for user-facing errors.

### Verification
Manual, in Logseq (§7).

---

## 6. `dev` workflow (hot reload)

1. `pnpm dev` — Vite serves with `vite-plugin-logseq` HMR.
2. In Logseq: Settings → turn on **Developer mode**. `t p` → plugins dashboard →
   **Load unpacked plugin** → select the repo root (the dir containing `package.json`).
3. Edit `src/*`, changes hot-reload. If registration changes don't take, toggle the plugin
   off/on in the dashboard.

---

## 7. Manual test matrix (the real acceptance gate)

Run every row in a scratch Logseq graph. Record pass/fail in a working file
`.sprint/zetlify-slash-to-page/test-results.md`.

| # | Input block state | Expected result |
|---|---|---|
| 1 | Block with content, no children | New page named `yyyymmddhhmmssxx`; page's first block = the content; original block becomes `{{embed [[<name>]]}}`. |
| 2 | Block with content + several children | Content = first block on page; children moved below it in original order; original → embed; no empty stray block. |
| 3 | **Empty** block with children | Children moved to page (no leading empty block); original → embed. |
| 4 | Empty block, no children | Page created (single empty block ok); original → embed. |
| 5 | Child block is referenced elsewhere via `((uuid))` | After zetlify, the `((uuid))` ref still resolves (UUID preserved by moveBlock). |
| 6 | Invoke twice quickly on two different blocks | Two **different** page names; two correct embeds. |
| 7 | Block whose content is already `[[a link]]` | Content copied verbatim to page first block (no double-bracketing corruption). |
| 8 | Collapsed block with children | Embed renders (collapsed property removed). |

### Verification
All 8 rows pass. Any failure → fix before touching CI.

---

## 8. CI/CD

Two workflows. Rationale and source lineage in `RESEARCH.md` §2. Modernized action versions.

### 8a. `.github/workflows/build.yml` — fast breakage check on every push/PR
```yaml
name: Build
on:
  push:
    branches: ["main", "master"]
  pull_request:
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm build
```

### 8b. `.github/workflows/publish.yml` — the marketplace-required release build
Triggered on version tags. Produces the `.zip` the marketplace expects, attached to a
GitHub Release, plus the `package.json` asset.
```yaml
name: Publish
on:
  push:
    tags:
      - "v*"
env:
  PLUGIN_NAME: logseq-plugin-zetlify
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Package
        id: package
        run: |
          mkdir ${{ env.PLUGIN_NAME }}
          cp README.md package.json icon.png ${{ env.PLUGIN_NAME }}
          mv dist ${{ env.PLUGIN_NAME }}
          zip -r ${{ env.PLUGIN_NAME }}.zip ${{ env.PLUGIN_NAME }}
          echo "tag=${GITHUB_REF#refs/tags/}" >> "$GITHUB_OUTPUT"
      - name: Create release + attach assets
        uses: ncipollo/release-action@v1
        with:
          allowUpdates: true
          draft: false
          prerelease: false
          artifacts: "${{ env.PLUGIN_NAME }}.zip,package.json"
          token: ${{ secrets.GITHUB_TOKEN }}
```

### Notes
- `secrets.GITHUB_TOKEN` is provided automatically by GitHub Actions — no manual secret
  setup needed. The workflow needs `contents: write`; default token has it for releases in
  most repos. If release creation 403s, add `permissions: { contents: write }` at job level.
- A `pnpm-lock.yaml` **must** be committed for `--frozen-lockfile` to work. Run `pnpm install`
  locally once and commit the lockfile.
- Do not add semantic-release. The marketplace contract only requires the zip-on-release.

### Verification
1. Push a branch → `build.yml` goes green.
2. `git tag v0.0.1 && git push origin v0.0.1` → `publish.yml` creates a Release with
   `logseq-plugin-zetlify.zip` and `package.json` attached.
3. Download the zip, unzip, confirm it contains `dist/`, `package.json`, `icon.png`, `README.md`.

---

## 9. Repo hygiene

1. `.gitignore`: `node_modules`, `dist` (dist is built in CI; do not commit).
2. `README.md`: replace the stub with — what the plugin does, a GIF/screenshot placeholder
   (needed later for marketplace), install-unpacked instructions, and the `/zetlify` usage.
   > The marketplace requires at least one image showing it in action; add a real GIF before
   > any future marketplace submission (out of scope this sprint, but leave the placeholder).
3. Commit `pnpm-lock.yaml`.
4. `LICENSE`: MIT (matches `package.json`).

---

## 10. Definition of Done checklist

> **Status as of implementation pass (commit `b689a99`, pushed to
> `origin/main`):** code, scaffold, CI configs, and docs are complete. Items
> that require a live Logseq desktop instance or a pushed release tag could
> not be executed in the implementation sandbox. See `BACKLOG.md` in this
> same directory for the full explanation of each open item and how to close
> it out. **This sprint is NOT yet done** — the checkboxes below reflect
> actual verified status, not aspirational completion.

- [x] `pnpm typecheck` and `pnpm build` pass locally. *(verified in sandbox)*
- [ ] Plugin loads unpacked; `/zetlify` command appears. *(not verified — no Logseq desktop available; see BACKLOG.md §1)*
- [ ] All 8 rows of the §7 test matrix pass; results recorded in `test-results.md`. *(scaffolded, all rows "Not yet run"; see BACKLOG.md §1)*
- [ ] Page names match `yyyymmddhhmmssxx`; no collisions on rapid double-invoke. *(only pure-function format verified via `scratch-timestamp.mjs`; live collision guard against `logseq.Editor.getPage` untested; see BACKLOG.md §1)*
- [ ] Original block becomes `{{embed [[<name>]]}}`; children moved with UUIDs intact. *(implemented per plan §5 but not manually verified in a real graph; see BACKLOG.md §1)*
- [ ] `build.yml` green on push. *(pushed to origin/main; Actions run not checked; see BACKLOG.md §2)*
- [ ] `publish.yml` produces a Release with a correctly-structured `.zip`. *(no tag pushed yet; see BACKLOG.md §2)*
- [x] `.gitignore`, `README`, `LICENSE`, `pnpm-lock.yaml` committed. *(verified — all present in commit `b689a99`)*

---

## Appendix — file layout when done
```
logseq-plugin-zetlify/
├─ .github/workflows/build.yml
├─ .github/workflows/publish.yml
├─ .sprint/zetlify-slash-to-page/   (this plan + all working files)
├─ src/main.ts
├─ src/timestamp.ts
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ package.json
├─ pnpm-lock.yaml
├─ icon.png
├─ README.md
├─ LICENSE
└─ .gitignore
```
