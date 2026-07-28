// Playwright config for the Tier 2 (real-Logseq) suite. SCAFFOLD — see PLAN.md §6.
//
// NOTE: `@playwright/test` is intentionally NOT yet a dependency. Install it in
// Phase 3 (PR-B):  pnpm add -D @playwright/test@^1  &&  npx playwright install-deps
// and commit the updated pnpm-lock.yaml. Until then this file (and zetlify.e2e.ts)
// will not resolve — that is expected; they are stubs handed to the developer.

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.e2e\.ts/,
  // Electron UI tests share one app instance — run serially, never in parallel.
  fullyParallel: false,
  workers: 1,
  // UI-under-Xvfb is slower + flakier than unit tests; give generous timeouts and
  // rely on readiness polling (not fixed sleeps) inside the spec.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
});
