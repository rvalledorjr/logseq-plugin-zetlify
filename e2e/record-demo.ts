// Demo GIF recorder — drives a REAL Logseq desktop (same Tier-2 harness the e2e suite
// uses) to perform the full "journal quick-capture" scenario end-to-end while
// Playwright records video, then converts the recording to an optimized GIF for the
// README.
//
// Not part of the test suite (no assertions) — this is tooling, run on demand via
// `pnpm demo:gif`. Regenerate whenever the UI or the demo script changes.
//
// Scenario recorded (per user request):
// 1. Start on the (blank) journal page.
// 2. Block 1: type "/zetlify" immediately (empty block), invoke it, then — once the
//    blank embedded zetlify page renders on the block — click into that embedded page
//    and write a reflective thought there.
// 3. Block 2 (next sibling on the journal): same pattern — /zetlify first, then write
//    a second reflective thought inside its embedded page.
// 4. Block 3 (next sibling): type content directly (no /zetlify yet) with its own
//    child block also written directly. Once done, invoke /zetlify on the PARENT
//    block only — moving both parent content and child onto the new page.
// 5. Only after all three journal-page invocations are done, navigate to each spawned
//    zetlified page one-by-one, in the order they were created.

import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { launchWithPlugin } from "./harness";
import type { Page } from "@playwright/test";

const OUT_DIR = join(__dirname, "..", "docs");
const OUT_GIF = join(OUT_DIR, "demo.gif");
const VIDEO_SIZE = { width: 1000, height: 640 };

/** Click into a not-yet-embed top-level block's content area to enter edit mode. */
async function clickLastHostBlock(win: Page): Promise<void> {
  const host = win.locator('.ls-block:not([data-embed="true"])').last();
  await host.locator(".block-content").first().click({ position: { x: 5, y: 5 } });
}

/**
 * On an already-focused, empty block: type "/zetlify", let the real slash-command menu
 * render, invoke it, wait for the embed + blank spawned page to render, then click into
 * that embedded page and write a reflective thought there.
 */
async function captureViaZetlify(win: Page, reflection: string): Promise<void> {
  await win.keyboard.type("/zetlify", { delay: 60 });
  await win.waitForTimeout(1000); // let the real slash-command menu render, visible on screen
  await win.keyboard.press("Enter");
  await win.waitForTimeout(1800); // let the embed rewrite + blank page creation render on screen

  await win.locator(".embed-page textarea").last().click();
  await win.waitForTimeout(400);
  await win.keyboard.type(reflection, { delay: 22 });
  await win.waitForTimeout(1500); // let the content flush before moving on

  await win.keyboard.press("Escape"); // exit editing the embedded block cleanly
  await win.waitForTimeout(400);
}

async function main(): Promise<void> {
  const videoDir = mkdtempSync(join(tmpdir(), "zetlify-demo-video-"));
  console.log(`[demo] launching Logseq (recording to ${videoDir})...`);

  const recordingStart = Date.now(); // approximates the video's t=0 (page/window creation)
  const h = await launchWithPlugin({ recordVideo: { dir: videoDir, size: VIDEO_SIZE } });
  await h.win.setViewportSize(VIDEO_SIZE);

  // The default journal page (today) already opens with a single blank block — no
  // seeding needed, this is the real "typing directly on the journal" scenario.
  await h.win.waitForTimeout(1500);

  const demoStart = (Date.now() - recordingStart) / 1000;

  console.log("[demo] block 1: /zetlify first, then write inside the embedded page...");
  await h.win.locator(".ls-block textarea").first().click();
  await h.win.waitForTimeout(400);
  await captureViaZetlify(
    h.win,
    "The hardest lesson life taught me is that closure rarely comes from the other person — it comes from the meaning I choose to make on my own.",
  );

  console.log("[demo] block 2: /zetlify first, then write inside the embedded page...");
  await clickLastHostBlock(h.win);
  await h.win.waitForTimeout(400);
  await h.win.keyboard.press("End");
  await h.win.keyboard.press("Enter");
  await h.win.waitForTimeout(400);
  await captureViaZetlify(
    h.win,
    "I used to think patience meant waiting quietly. Now I think it means staying kind while nothing changes yet.",
  );

  console.log("[demo] block 3: writing directly, with a child, then /zetlify on the parent...");
  await clickLastHostBlock(h.win);
  await h.win.waitForTimeout(400);
  await h.win.keyboard.press("End");
  await h.win.keyboard.press("Enter");
  await h.win.waitForTimeout(400);
  await h.win.keyboard.type("On letting go", { delay: 25 });
  await h.win.waitForTimeout(500);
  await h.win.keyboard.press("Enter");
  await h.win.keyboard.press("Tab"); // indent into a child block
  await h.win.waitForTimeout(300);
  await h.win.keyboard.type(
    "Most of what I called moving on was really just carrying the same weight more quietly.",
    { delay: 20 },
  );
  await h.win.waitForTimeout(1800); // let the child block's content flush before navigating away from it

  // Jump back up to the parent block (not the child) and invoke /zetlify there. Poll
  // until the parent's own textarea (not the child's) is actually focused, since a
  // stale click can occasionally land on the wrong block right after a fast edit.
  const parentBlock = h.win.locator(".ls-block").filter({ hasText: "On letting go" }).first();
  for (let attempt = 0; attempt < 5; attempt++) {
    await parentBlock.locator(".block-content").first().click({ position: { x: 5, y: 5 } });
    await h.win.waitForTimeout(500);
    const focusedValue = await h.win.evaluate(
      () => (document.activeElement as HTMLTextAreaElement | null)?.value ?? null,
    );
    if (focusedValue === "On letting go") break;
    await h.win.waitForTimeout(500);
  }
  await h.win.keyboard.press("End");
  await h.win.waitForTimeout(1000);
  await h.win.keyboard.type(" /zetlify", { delay: 60 });
  await h.win.waitForTimeout(1000); // let the real slash-command menu render, visible on screen
  await h.win.keyboard.press("Enter");
  await h.win.waitForTimeout(3500); // extra settle: this invocation moves two blocks (parent + child)

  // All three journal-page invocations are done. Collect the spawned page names, in the
  // order they were created (creation order == embed appearance order on the page).
  const targets: string[] = await h.win.evaluate(() =>
    Array.from(document.querySelectorAll("a.page-ref[data-ref]"))
      .map((a) => a.getAttribute("data-ref") as string)
      .filter((r) => /^\d{16}$/.test(r)),
  );
  if (targets.length !== 3) {
    throw new Error(`expected 3 zetlified pages, found ${targets.length}: ${targets.join(", ")}`);
  }
  console.log("[demo] spawned pages, in order:", targets);

  // Sanity check: the 3rd page must have both the parent line and its moved child line —
  // if the parent-block-refocus race lost the child, fail loudly rather than ship a GIF
  // that silently doesn't match the intended scenario.
  const thirdPageLines: string[] = await h.win.evaluate(async (page) => {
    const tree = await (window as any).logseq.api.get_page_blocks_tree(page);
    return tree.map((b: any) => b.content as string);
  }, targets[2]);
  if (thirdPageLines.length < 2) {
    throw new Error(
      `3rd zetlified page (${targets[2]}) is missing its child block — got: ${JSON.stringify(thirdPageLines)}. Re-run the recorder.`,
    );
  }
  console.log("[demo] 3rd page verified with parent + child:", thirdPageLines);

  console.log("[demo] navigating to each spawned page, one by one...");
  for (const target of targets) {
    await h.win.evaluate((page) => {
      (window as any).location.hash = `#/page/${page}`;
    }, target);
    await h.win.waitForTimeout(1800); // hold on each page long enough to read in the GIF
  }

  console.log("[demo] closing app to flush video...");
  const video = h.win.video();
  await h.app.close();

  if (!video) throw new Error("Playwright did not attach a video to the recorded page");
  const webmPath = await video.path();
  console.log(`[demo] recorded ${webmPath}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const paletteFile = join(videoDir, "palette.png");

  console.log("[demo] converting to GIF via ffmpeg...");
  // Two-pass palette-based GIF encode: much smaller/cleaner than a naive single-pass
  // conversion. Downscale to 700px wide, 12fps — small enough for a README, still
  // readable text.
  const filterScale = "fps=12,scale=700:-1:flags=lanczos";
  const trimStart = Math.max(0, demoStart - 1); // 1s pad so the block is visible before typing starts
  execFileSync("ffmpeg", [
    "-y",
    "-ss", String(trimStart),
    "-i", webmPath,
    "-vf", `${filterScale},palettegen`,
    "-update", "1", "-frames:v", "1",
    paletteFile,
  ]);
  execFileSync("ffmpeg", [
    "-y",
    "-ss", String(trimStart),
    "-i", webmPath,
    "-i", paletteFile,
    "-lavfi", `${filterScale}[x];[x][1:v]paletteuse`,
    OUT_GIF,
  ]);

  rmSync(videoDir, { recursive: true, force: true });
  console.log(`[demo] wrote ${OUT_GIF}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
