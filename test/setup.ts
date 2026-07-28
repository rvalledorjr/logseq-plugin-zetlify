// Vitest setup file (referenced by vitest.config.ts).
//
// Tests assign a fresh fake to the `logseq` global in their own `beforeEach`
// (see zetlify.test.ts) via `(global as any).logseq = makeFakeLogseq()`, so state
// never leaks between the 8 matrix rows. No global declaration is needed here —
// `@logseq/libs` already declares `logseq: ILSPluginUser` ambiently project-wide,
// and re-declaring it as `any` would conflict with that type.

export {};
