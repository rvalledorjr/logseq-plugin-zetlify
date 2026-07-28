import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { makeFakeLogseq, type FakeLogseq } from "./fake-logseq";
import { zetlify } from "../src/zetlify";

// The real business logic under test is `zetlify()` (src/zetlify.ts) plus
// `makeUniquePageName()` (src/timestamp.ts, called transitively). Each test seeds one
// of the 8 input states from PLAN.md §7 (zetlify-slash-to-page), runs the REAL code
// against the fake, and asserts on the resulting fake state.

let fake: FakeLogseq;

// Helper: the single page created by a zetlify run (there is exactly one per run).
function onlyNewPage() {
  const names = [...fake.__state.pages.keys()];
  expect(names.length).toBe(1);
  return fake.__state.pages.get(names[0])!;
}

beforeEach(() => {
  fake = makeFakeLogseq();
  // zetlify() and makeUniquePageName() talk to a `logseq` global.
  (global as any).logseq = fake;
});

afterEach(() => {
  vi.useRealTimers();
  delete (global as any).logseq;
});

describe("zetlify — §7 manual test matrix, automated (Tier 1)", () => {
  it("row 1: block with content, no children", async () => {
    const block = fake.seedBlock({ content: "hello world" });

    await zetlify(block.uuid);

    const page = onlyNewPage();
    expect(page.blocks.length).toBe(1);
    expect(page.blocks[0].content).toBe("hello world");
    // Original block rewritten to an embed pointing at the new page.
    expect(block.content).toBe(`{{embed [[${page.name}]]}}`);
  });

  it("row 2: block with content + several children (order + UUIDs preserved)", async () => {
    const block = fake.seedBlock({
      content: "parent",
      children: [
        { uuid: "c1", content: "child 1" },
        { uuid: "c2", content: "child 2" },
        { uuid: "c3", content: "child 3" },
      ],
    });

    await zetlify(block.uuid);

    const page = onlyNewPage();
    // First block = the parent's own content; children follow in original order.
    expect(page.blocks.map((b) => b.content)).toEqual([
      "parent",
      "child 1",
      "child 2",
      "child 3",
    ]);
    // Child UUIDs preserved by moveBlock.
    expect(page.blocks.slice(1).map((b) => b.uuid)).toEqual(["c1", "c2", "c3"]);
    // No stray empty block.
    expect(page.blocks.some((b) => b.content === "")).toBe(false);
    expect(block.content).toBe(`{{embed [[${page.name}]]}}`);
  });

  it("row 3: empty block with children (no leading empty block)", async () => {
    const block = fake.seedBlock({
      content: "",
      children: [
        { uuid: "d1", content: "child A" },
        { uuid: "d2", content: "child B" },
      ],
    });

    await zetlify(block.uuid);

    const page = onlyNewPage();
    expect(page.blocks.map((b) => b.content)).toEqual(["child A", "child B"]);
    expect(page.blocks.map((b) => b.uuid)).toEqual(["d1", "d2"]);
    expect(block.content).toBe(`{{embed [[${page.name}]]}}`);
  });

  it("row 4: empty block, no children (single empty block ok)", async () => {
    const block = fake.seedBlock({ content: "" });

    await zetlify(block.uuid);

    const page = onlyNewPage();
    // Page exists with its single (empty) block; that's acceptable.
    expect(page.blocks.length).toBe(1);
    expect(page.blocks[0].content).toBe("");
    expect(block.content).toBe(`{{embed [[${page.name}]]}}`);
  });

  it("row 5: child referenced elsewhere via ((uuid)) still resolves after move", async () => {
    const block = fake.seedBlock({
      content: "note",
      children: [{ uuid: "ref-target", content: "referenced block" }],
    });

    await zetlify(block.uuid);

    // UUID preserved => a ((ref-target)) elsewhere still resolves via getBlock.
    const resolved = await fake.Editor.getBlock("ref-target");
    expect(resolved).not.toBeNull();
    expect(resolved!.content).toBe("referenced block");
  });

  it("row 6: two invocations produce two different page names (collision guard)", async () => {
    // Freeze the clock so both runs start from the SAME base timestamp, forcing
    // makeUniquePageName's collision-bump branch to engage deterministically.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-06T09:32:45.107"));

    const b1 = fake.seedBlock({ content: "first" });
    const b2 = fake.seedBlock({ content: "second" });

    await zetlify(b1.uuid);
    await zetlify(b2.uuid);

    const names = [...fake.__state.pages.keys()];
    expect(names.length).toBe(2);
    expect(names[0]).not.toBe(names[1]); // distinct despite identical clock
    expect(b1.content).toBe(`{{embed [[${names[0]}]]}}`);
    expect(b2.content).toBe(`{{embed [[${names[1]}]]}}`);
  });

  it("row 7: content already a [[link]] is copied verbatim (no double-bracketing)", async () => {
    const block = fake.seedBlock({ content: "[[a link]]" });

    await zetlify(block.uuid);

    const page = onlyNewPage();
    expect(page.blocks[0].content).toBe("[[a link]]");
    expect(block.content).toBe(`{{embed [[${page.name}]]}}`);
  });

  it("row 8: collapsed block with children has collapsed property removed", async () => {
    const block = fake.seedBlock({
      content: "collapsible",
      properties: { collapsed: true },
      children: [{ uuid: "e1", content: "hidden child" }],
    });

    await zetlify(block.uuid);

    // Collapsed property removed so the embed renders.
    expect(block.properties?.collapsed).toBeUndefined();
    const page = onlyNewPage();
    expect(page.blocks.map((b) => b.content)).toEqual(["collapsible", "hidden child"]);
    expect(block.content).toBe(`{{embed [[${page.name}]]}}`);
  });
});
