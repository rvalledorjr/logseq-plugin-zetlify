import { defineConfig } from "@playwright/test";

// Tier 2 config — drives a real Logseq desktop instance. One serial worker: the whole
// suite shares a single Logseq launch (boot is slow), and Electron UI must not be driven
// by parallel workers. Generous timeouts absorb app boot + graph indexing + file flush.
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000, // per-test; first test also pays the shared boot in beforeAll
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
});
