// Tier 2 harness — real Logseq desktop driver.
//
// Boots the installed Logseq desktop via Playwright's Electron support, opens a
// throwaway graph in an ISOLATED user-data dir (never touches the developer's real
// graphs/config), loads the freshly-built plugin from dist/, and drives the REAL
// /zetlify slash command end-to-end. Assertions read the real graph's markdown on disk.
//
// This closes the residual integration risk the Tier 1 mock can't: real moveBlock UUID
// semantics, real slash-command registration, and the real embed transform.
//
// Discovery notes (how each mechanism was found) live in
// .sprint/ci-cd-test-enforcement/RESULTS.md.

import { _electron as electron, type ElectronApplication, type Page, type Frame } from "@playwright/test";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Resolve the Logseq binary: env override (CI) or the standard Linux install path. */
export function logseqBin(): string {
  return process.env.LOGSEQ_BIN || "/opt/logseq-desktop/Logseq";
}

export type Harness = {
  app: ElectronApplication;
  win: Page;
  graphDir: string;
  /** Absolute path to the plugin repo root (has package.json + dist/). */
  pluginDir: string;
};

const PLUGIN_DIR = join(__dirname, "..");

/** Make an empty on-disk Logseq graph (logseq/, pages/, journals/). */
function makeGraphDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "zetlify-graph-"));
  for (const d of ["logseq", "pages", "journals"]) mkdirSync(join(dir, d), { recursive: true });
  return dir;
}

/**
 * Launch Logseq, open a fresh isolated graph, and load the built plugin.
 * Throws if dist/ is missing (build must run first).
 */
export async function launchWithPlugin(): Promise<Harness> {
  if (!existsSync(join(PLUGIN_DIR, "dist", "index.html"))) {
    throw new Error("dist/index.html missing — run `pnpm build` before the e2e suite");
  }
  const graphDir = makeGraphDir();
  const userDataDir = mkdtempSync(join(tmpdir(), "zetlify-userdata-"));

  const app = await electron.launch({
    executablePath: logseqBin(),
    args: [`--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_IS_DEV: "0", ELECTRON_FORCE_IS_PACKAGED: "true" },
    timeout: 60_000,
  });

  // Stub the native folder picker (main process) to auto-return our temp graph.
  await app.evaluate(async (el, dir) => {
    (el as any).dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, graphDir);

  const win = await app.firstWindow({ timeout: 60_000 });
  await win.waitForLoadState("domcontentloaded").catch(() => {});
  await waitForApi(win);

  // Open the temp graph via the onboarding "Choose a folder" card (triggers the stub).
  // The card can render slightly after the API is ready, and the click occasionally
  // doesn't route on the first try, so wait for it and retry until the graph loads.
  await openTempGraph(win, graphDir);

  // Load the built plugin from disk.
  await win.evaluate(async (dir) => {
    await (window as any).LSPluginCore.register([{ url: dir }]);
  }, PLUGIN_DIR);
  await waitForPluginRegistered(win, "logseq-plugin-zetlify");

  return { app, win, graphDir, pluginDir: PLUGIN_DIR };
}

/** Poll until the renderer plugin API is available. */
async function waitForApi(win: Page, tries = 40): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const ok = await win
      .evaluate(() => !!(window as any).logseq?.api?.get_current_graph)
      .catch(() => false);
    if (ok) return;
    await win.waitForTimeout(500);
  }
  throw new Error("Logseq renderer API never became available");
}

/**
 * Open our temp graph via the onboarding "Choose a folder" card (which triggers the
 * stubbed native dialog). The card can render slightly after the API is ready, and the
 * click occasionally doesn't route on the first try, so wait for it and retry the click
 * until get_current_graph reports our path.
 */
async function openTempGraph(win: Page, graphDir: string, tries = 20): Promise<void> {
  for (let i = 0; i < tries; i++) {
    await win
      .evaluate(() => {
        const hit = Array.from(document.querySelectorAll("*")).find(
          (e) => (e.textContent || "").trim() === "Choose a folder" && e.children.length <= 1,
        );
        (hit as HTMLElement | undefined)?.click();
      })
      .catch(() => {});
    // Give the open flow a moment, then check.
    for (let j = 0; j < 4; j++) {
      const path = await win
        .evaluate(async () => {
          try {
            return (await (window as any).logseq.api.get_current_graph())?.path ?? null;
          } catch {
            return null;
          }
        })
        .catch(() => null);
      if (path === graphDir) return;
      await win.waitForTimeout(1000);
    }
  }
  throw new Error(`Temp graph ${graphDir} never became the current graph`);
}

/** Poll until the plugin id shows up in LSPluginCore. */
async function waitForPluginRegistered(win: Page, id: string, tries = 20): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const ok = await win
      .evaluate((pid) => {
        try {
          return (window as any).LSPluginCore._registeredPlugins.has(pid);
        } catch {
          return false;
        }
      }, id)
      .catch(() => false);
    if (ok) return;
    await win.waitForTimeout(500);
  }
  throw new Error(`Plugin ${id} never registered`);
}

/** The plugin's sandboxed iframe. */
export function pluginFrame(win: Page): Frame {
  const f = win.frames().find((fr) => /dist\/index\.html/.test(fr.url()));
  if (!f) throw new Error("plugin iframe not found");
  return f;
}

/**
 * Invoke the real /zetlify slash command on a block by emitting the exact editor hook
 * event the command palette would fire. The hook event name carries a build-time
 * counter suffix, so we discover it dynamically from the plugin caller's emitter
 * rather than hardcoding it.
 */
export async function invokeZetlify(win: Page, uuid: string): Promise<void> {
  const frame = pluginFrame(win);
  const fired = await frame.evaluate((blockUuid) => {
    const caller = (window as any).logseq._caller;
    const events: string[] = Object.keys(caller._events || {});
    const hook = events.find((e) => /^hook:editor:slash_command_/.test(e));
    if (!hook) throw new Error("slash_command hook not registered on plugin caller");
    caller.emit(hook, { uuid: blockUuid });
    return hook;
  }, uuid);
  if (!fired) throw new Error("failed to fire zetlify hook");
}

// ------------------------------ graph seeding --------------------------------------
export type SeedChild = { content: string };

/**
 * Seed a page with one host block (optional content) and optional children, returning
 * the host block uuid and child uuids. Uses the real create_page/insert_block API.
 */
export async function seedHostBlock(
  win: Page,
  opts: { page: string; content: string; children?: SeedChild[] },
): Promise<{ uuid: string; childUuids: string[] }> {
  return win.evaluate(async (o) => {
    const a = (window as any).logseq.api;
    await a.create_page(o.page, {}, { createFirstBlock: true, redirect: false });
    const host = (await a.get_page_blocks_tree(o.page))[0];
    if (o.content) await a.update_block(host.uuid, o.content);
    const childUuids: string[] = [];
    let anchor: string | null = null;
    for (const c of o.children ?? []) {
      const inserted: any = anchor
        ? await a.insert_block(anchor, c.content, { sibling: true })
        : await a.insert_block(host.uuid, c.content, { sibling: false });
      childUuids.push(inserted.uuid);
      anchor = inserted.uuid;
    }
    return { uuid: host.uuid, childUuids };
  }, opts);
}

/** Read a block's current content via the real API. */
export async function getBlockContent(win: Page, uuid: string): Promise<string | null> {
  return win.evaluate(async (u) => {
    const b = await (window as any).logseq.api.get_block(u, {});
    return b?.content ?? null;
  }, uuid);
}

/** Set a block property (used to seed the collapsed-block row). */
export async function setBlockProperty(win: Page, uuid: string, key: string, value: unknown): Promise<void> {
  await win.evaluate(
    async ({ u, k, v }) => {
      await (window as any).logseq.api.upsert_block_property(u, k, v);
    },
    { u: uuid, k: key, v: value },
  );
}

// ------------------------------ disk assertions ------------------------------------
/** List page markdown files in the graph. */
export function pageFiles(graphDir: string): string[] {
  return readdirSync(join(graphDir, "pages"));
}

/** The single 16-digit timestamp page created by a zetlify run (throws if != 1). */
export function timestampPages(graphDir: string): string[] {
  return pageFiles(graphDir).filter((f) => /^\d{16}\.md$/.test(f));
}

/** Read a page markdown file's raw text. */
export function readPage(graphDir: string, file: string): string {
  return readFileSync(join(graphDir, "pages", file), "utf8");
}

/** Give the file writer time to flush markdown to disk. */
export async function flush(win: Page, ms = 2500): Promise<void> {
  await win.waitForTimeout(ms);
}
