// Demo GIF recorder — drives a REAL Logseq desktop (same Tier-2 harness the e2e suite
// uses) to perform an actual /zetlify invocation end-to-end while Playwright records
// video, then converts the recording to an optimized GIF for the README.
//
// Not part of the test suite (no assertions) — this is tooling, run on demand via
// `pnpm demo:gif`. Regenerate whenever the UI or the demo script changes.
//
// How it works:
// 1. Launch real Logseq (e2e/harness.ts) with Playwright's built-in `recordVideo`.
// 2. Seed a page with a host block + a couple of children — something visually
//    demo-worthy, not "hello world".
// 3. Drive REAL UI: click into the block, type real keystrokes (" /zetlify"), let the
//    real slash-command menu render, press Enter to invoke it — no test-only shortcuts.
// 4. Give Logseq a moment to render the resulting embed, then close the app (this is
//    when Playwright flushes the .webm to disk).
// 5. Convert the .webm to a cropped, downscaled, looping GIF via ffmpeg.

import { mkdtempSync, copyFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { launchWithPlugin, seedHostBlock } from "./harness";

const OUT_DIR = join(__dirname, "..", "docs");
const OUT_GIF = join(OUT_DIR, "demo.gif");
const VIDEO_SIZE = { width: 1000, height: 640 };

async function main(): Promise<void> {
  const videoDir = mkdtempSync(join(tmpdir(), "zetlify-demo-video-"));
  console.log(`[demo] launching Logseq (recording to ${videoDir})...`);

  const recordingStart = Date.now(); // approximates the video's t=0 (page/window creation)
  const h = await launchWithPlugin({ recordVideo: { dir: videoDir, size: VIDEO_SIZE } });
  await h.win.setViewportSize(VIDEO_SIZE);

  console.log("[demo] seeding demo content...");
  const { uuid } = await seedHostBlock(h.win, {
    page: "Zetlify demo",
    content: "Meeting notes: Q3 roadmap review",
    children: [
      { content: "Discussed timeline slip on the migration" },
      { content: "Action: sync with design by Friday" },
    ],
  });

  // Navigate to the seeded page so the block is on screen. This is where the
  // interesting part of the recording starts — everything before it (app boot,
  // onboarding, graph creation) gets trimmed off below.
  const demoStart = (Date.now() - recordingStart) / 1000;
  await h.win.evaluate((page) => {
    (window as any).location.hash = `#/page/${page}`;
  }, "Zetlify demo");
  await h.win.waitForTimeout(1500);

  const blockContent = `.ls-block[blockid="${uuid}"] .block-content`;
  await h.win.locator(blockContent).first().click();
  await h.win.waitForTimeout(600);

  console.log("[demo] typing /zetlify...");
  await h.win.keyboard.press("End");
  await h.win.keyboard.type(" /zetlify", { delay: 90 });
  await h.win.waitForTimeout(1200); // let the slash menu render, visible in the recording

  await h.win.keyboard.press("Enter");
  await h.win.waitForTimeout(2500); // let the embed rewrite + page creation settle on screen

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
