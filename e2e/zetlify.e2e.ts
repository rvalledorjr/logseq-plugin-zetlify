import { test, expect, type Page } from "@playwright/test";
import {
  launchWithPlugin,
  invokeZetlify,
  seedHostBlock,
  getBlockContent,
  setBlockProperty,
  timestampPages,
  readPage,
  pageFiles,
  flush,
  type Harness,
} from "./harness";

// Tier 2 — the §7 matrix run against a REAL Logseq desktop instance.
//
// One shared Logseq launch for the whole file (boot is ~20-30s); each row gets its own
// host page so runs don't interfere. Assertions read the real graph's markdown on disk
// and/or the live block API — this is the high-fidelity gate the Tier 1 mock cannot be.
//
// The embed body is the 16-digit timestamp page name. We capture it per row by diffing
// which timestamp page appeared, and cross-check it against the host block's embed text.

let h: Harness;

test.beforeAll(async () => {
  h = await launchWithPlugin();
});

test.afterAll(async () => {
  await h?.app.close();
});

// Helper: run zetlify on a freshly seeded host block and return the resulting embed
// target page name + the new page's block lines (from disk).
async function runRow(
  win: Page,
  graphDir: string,
  opts: { page: string; content: string; children?: { content: string }[] },
): Promise<{ hostContent: string; embedTarget: string | null; newPageLines: string[] | null; before: string[] }> {
  const before = timestampPages(graphDir);
  const { uuid } = await seedHostBlock(win, opts);
  await invokeZetlify(win, uuid);
  await flush(win);

  const hostContent = (await getBlockContent(win, uuid)) ?? "";
  const m = hostContent.match(/\{\{embed \[\[(\d{16})\]\]\}\}/);
  const embedTarget = m ? m[1] : null;

  let newPageLines: string[] | null = null;
  if (embedTarget) {
    const raw = readPage(graphDir, `${embedTarget}.md`);
    newPageLines = raw
      .split("\n")
      .map((l) => l.replace(/^\s*-\s?/, "").trim())
      .filter((l) => l.length > 0);
  }
  return { hostContent, embedTarget, newPageLines, before };
}

test.describe("zetlify — §7 matrix against real Logseq (Tier 2)", () => {
  test("row 1: block with content, no children", async () => {
    const { hostContent, embedTarget, newPageLines } = await runRow(h.win, h.graphDir, {
      page: "row1",
      content: "hello world",
    });
    expect(embedTarget).toMatch(/^\d{16}$/);
    expect(hostContent).toBe(`{{embed [[${embedTarget}]]}}`);
    expect(newPageLines).toEqual(["hello world"]);
  });

  test("row 2: content + several children (order preserved)", async () => {
    const { hostContent, embedTarget, newPageLines } = await runRow(h.win, h.graphDir, {
      page: "row2",
      content: "parent",
      children: [{ content: "child 1" }, { content: "child 2" }, { content: "child 3" }],
    });
    expect(embedTarget).toMatch(/^\d{16}$/);
    expect(hostContent).toBe(`{{embed [[${embedTarget}]]}}`);
    expect(newPageLines).toEqual(["parent", "child 1", "child 2", "child 3"]);
  });

  test("row 3: empty block with children (no leading empty block)", async () => {
    const { hostContent, embedTarget, newPageLines } = await runRow(h.win, h.graphDir, {
      page: "row3",
      content: "",
      children: [{ content: "child A" }, { content: "child B" }],
    });
    expect(embedTarget).toMatch(/^\d{16}$/);
    expect(hostContent).toBe(`{{embed [[${embedTarget}]]}}`);
    expect(newPageLines).toEqual(["child A", "child B"]);
  });

  test("row 4: empty block, no children (single empty block ok)", async () => {
    // Empty host + no children: zetlify still creates the page and rewrites the host to
    // an embed. Logseq does NOT flush an all-empty page to a markdown file on disk (empty
    // pages aren't persisted), so we assert on the live embed rather than a page file.
    const { uuid } = await seedHostBlock(h.win, { page: "row4", content: "" });
    await invokeZetlify(h.win, uuid);
    await flush(h.win);
    const hostContent = (await getBlockContent(h.win, uuid)) ?? "";
    expect(hostContent).toMatch(/^\{\{embed \[\[\d{16}\]\]\}\}$/);
    // The embed target resolves as a real page via the API even if no md file exists yet.
    const target = hostContent.match(/\d{16}/)![0];
    const page = await h.win.evaluate(async (name) => {
      return await (window as any).logseq.api.get_page(name);
    }, target);
    expect(page).toBeTruthy();
  });

  test("row 5: child UUID preserved after move (ref integrity)", async () => {
    const { uuid } = await seedHostBlock(h.win, {
      page: "row5",
      content: "note",
      children: [{ content: "referenced block" }],
    });
    // Capture the child uuid before the move.
    const childBefore = await h.win.evaluate(async (u) => {
      const a = (window as any).logseq.api;
      const host = await a.get_block(u, { includeChildren: true });
      return host?.children?.[0]?.[1] ?? host?.children?.[0]?.uuid ?? null;
    }, uuid);
    expect(childBefore).toBeTruthy();

    await invokeZetlify(h.win, uuid);
    await flush(h.win);

    // The same uuid must still resolve (moveBlock preserves it).
    const resolved = await getBlockContent(h.win, childBefore as string);
    expect(resolved).toBe("referenced block");
  });

  test("row 6: two invocations produce two different page names", async () => {
    const r1 = await runRow(h.win, h.graphDir, { page: "row6a", content: "first" });
    const r2 = await runRow(h.win, h.graphDir, { page: "row6b", content: "second" });
    expect(r1.embedTarget).toMatch(/^\d{16}$/);
    expect(r2.embedTarget).toMatch(/^\d{16}$/);
    expect(r1.embedTarget).not.toBe(r2.embedTarget);
  });

  test("row 7: content already a [[link]] copied verbatim", async () => {
    const { hostContent, embedTarget, newPageLines } = await runRow(h.win, h.graphDir, {
      page: "row7",
      content: "[[a link]]",
    });
    expect(embedTarget).toMatch(/^\d{16}$/);
    expect(hostContent).toBe(`{{embed [[${embedTarget}]]}}`);
    expect(newPageLines).toEqual(["[[a link]]"]);
  });

  test("row 8: collapsed block with children → collapsed removed, children moved", async () => {
    const { uuid } = await seedHostBlock(h.win, {
      page: "row8",
      content: "collapsible",
      children: [{ content: "hidden child" }],
    });
    await setBlockProperty(h.win, uuid, "collapsed", true);
    await invokeZetlify(h.win, uuid);
    await flush(h.win);

    const hostContent = (await getBlockContent(h.win, uuid)) ?? "";
    expect(hostContent).toMatch(/^\{\{embed \[\[\d{16}\]\]\}\}$/);
    // collapsed property must be gone from the (now embed) host block.
    const props = await h.win.evaluate(async (u) => {
      return (await (window as any).logseq.api.get_block_properties(u)) ?? {};
    }, uuid);
    expect(props.collapsed).toBeUndefined();
  });
});
