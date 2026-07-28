// In-memory fake of the subset of `logseq.Editor.*` / `logseq.UI.*` that
// `zetlify()` and `makeUniquePageName()` actually call. It is DELIBERATELY MINIMAL:
// implement only the methods listed in the sprint plan (§4.1) with their documented
// contracts. This fake is an ASSUMPTION about Logseq's behavior, not ground truth —
// verifying that real Logseq behaves this way is Tier 2's job (e2e/). Do not grow
// this fake to model more of Logseq than the code under test touches.

export type FakeBlock = {
  uuid: string;
  content: string;
  properties?: Record<string, unknown>;
  children?: FakeBlock[];
  page?: { name: string };
};

type FakePage = { name: string; blocks: FakeBlock[] };

export type FakeLogseq = ReturnType<typeof makeFakeLogseq>;

export function makeFakeLogseq() {
  const pages = new Map<string, FakePage>();
  const blocksByUuid = new Map<string, FakeBlock>();
  const showMsgCalls: Array<{ msg: string; level?: string }> = [];
  let uuidSeq = 0;
  const newUuid = () => `uuid-${++uuidSeq}`;

  // --- Internal helper: detach a block from whatever list currently holds it. ---
  function detach(uuid: string): FakeBlock | null {
    for (const page of pages.values()) {
      const i = page.blocks.findIndex((b) => b.uuid === uuid);
      if (i !== -1) return page.blocks.splice(i, 1)[0];
    }
    // Also search nested children (invoked block's own children live under it).
    for (const b of blocksByUuid.values()) {
      if (!b.children) continue;
      const i = b.children.findIndex((c) => c.uuid === uuid);
      if (i !== -1) return b.children.splice(i, 1)[0];
    }
    return null;
  }

  function findContainerAndIndex(uuid: string): { list: FakeBlock[]; index: number } | null {
    for (const page of pages.values()) {
      const i = page.blocks.findIndex((b) => b.uuid === uuid);
      if (i !== -1) return { list: page.blocks, index: i };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Test-only seeding helpers (not part of the logseq API). Use these in
  // `beforeEach`/tests to build the 8 input block states from the §7 matrix.
  // ---------------------------------------------------------------------------
  function seedBlock(input: {
    uuid?: string;
    content?: string;
    properties?: Record<string, unknown>;
    children?: Array<{ uuid?: string; content?: string }>;
  }): FakeBlock {
    const block: FakeBlock = {
      uuid: input.uuid ?? newUuid(),
      content: input.content ?? "",
      properties: input.properties,
      children: (input.children ?? []).map((c) => {
        const child: FakeBlock = { uuid: c.uuid ?? newUuid(), content: c.content ?? "" };
        blocksByUuid.set(child.uuid, child);
        return child;
      }),
    };
    blocksByUuid.set(block.uuid, block);
    return block;
  }

  function seedPage(name: string): FakePage {
    const page: FakePage = { name, blocks: [] };
    pages.set(name, page);
    return page;
  }

  // ---------------------------------------------------------------------------
  // The fake logseq API surface (exactly §4.1).
  // ---------------------------------------------------------------------------
  const Editor = {
    async getBlock(uuid: string, _opts?: { includeChildren?: boolean }) {
      const b = blocksByUuid.get(uuid);
      if (!b) return null;
      // Return a snapshot whose `children` is a COPY. Real Logseq's getBlock hands
      // back a detached array; the caller iterates it while moveBlock relocates the
      // real blocks. Sharing the live array here would corrupt the for..of loop.
      return { ...b, children: b.children ? [...b.children] : [] };
    },

    async getPage(name: string) {
      return pages.get(name) ?? null;
    },

    async createPage(
      name: string,
      _props: Record<string, unknown>,
      opts?: { createFirstBlock?: boolean; redirect?: boolean },
    ) {
      const page = seedPage(name);
      if (opts?.createFirstBlock) {
        const b: FakeBlock = { uuid: newUuid(), content: "", page: { name } };
        page.blocks.push(b);
        blocksByUuid.set(b.uuid, b);
      }
      return { name };
    },

    async getPageBlocksTree(name: string) {
      return pages.get(name)?.blocks ?? [];
    },

    async updateBlock(uuid: string, content: string) {
      const b = blocksByUuid.get(uuid);
      if (b) b.content = content;
    },

    // Relocate the SAME block object (UUID preserved) as a sibling immediately
    // AFTER `targetUuid`. Preserves order across repeated calls because each moved
    // block becomes the next anchor in zetlify's loop.
    async moveBlock(
      srcUuid: string,
      targetUuid: string,
      _opts?: { children?: boolean; before?: boolean },
    ) {
      const moved = detach(srcUuid);
      if (!moved) return;
      const target = findContainerAndIndex(targetUuid);
      if (!target) return;
      // Attach to the target block's page.
      const targetBlock = target.list[target.index];
      moved.page = targetBlock.page;
      target.list.splice(target.index + 1, 0, moved);
      blocksByUuid.set(moved.uuid, moved); // ensure still resolvable by UUID
    },

    async removeBlock(uuid: string) {
      detach(uuid);
      blocksByUuid.delete(uuid);
    },

    async removeBlockProperty(uuid: string, key: string) {
      const b = blocksByUuid.get(uuid);
      if (b?.properties) delete b.properties[key];
    },

    async exitEditingMode() {
      /* no-op */
    },
  };

  const UI = {
    async showMsg(msg: string, level?: string) {
      showMsgCalls.push({ msg, level });
    },
  };

  return {
    Editor,
    UI,
    // Test-only surface:
    seedBlock,
    seedPage,
    __state: { pages, blocksByUuid, showMsgCalls },
  };
}
