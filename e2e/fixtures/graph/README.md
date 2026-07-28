# Tier 2 fixture graph (SCAFFOLD)

This directory must hold a **pre-seeded Logseq graph** that CI can open
non-interactively (CI cannot click Settings → Load unpacked plugin). Implement in
Phase 3 (PLAN.md §6.4). It needs to:

1. **Load the built plugin unpacked** — point Logseq at the repo's `dist/` output.
2. **Enable Developer mode.**
3. **Enable the HTTP APIs server** on a known port (Settings → Advanced → "HTTP server
   for plugin API access") so the e2e suite can assert on block/page state over REST
   instead of scraping the DOM.

Logseq stores graph config in `logseq/config.edn` and app-level settings in the app
config dir. Seed both here (or copy a known-good config into the runner's Logseq config
path before launch). Document whatever recipe works in `../../.sprint/ci-cd-test-enforcement/RESULTS.md`
so it's reproducible.

Secondary assertion path: the graph is plain markdown, so `pages/*.md` can be diffed
directly on disk as a cross-check against the HTTP API.
