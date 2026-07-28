import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";
import { makeUniquePageName } from "./timestamp";

export async function zetlify(uuid: string) {
  try {
    // 1. Get the invoked block with children.
    const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
    if (!block) return;

    // 2. Allocate a unique page name.
    const pageName = await makeUniquePageName();

    // 3. Create the page (do not redirect the user away).
    await logseq.Editor.createPage(pageName, {}, { createFirstBlock: true, redirect: false });

    // 4. Get that first block on the new page.
    const pageBlocks = await logseq.Editor.getPageBlocksTree(pageName);
    const firstBlock = pageBlocks[0]; // exists because createFirstBlock: true

    // 5. Write the invoked block's own content onto the first block (if any).
    const ownContent = (block.content ?? "").trim();
    if (ownContent.length > 0) {
      await logseq.Editor.updateBlock(firstBlock.uuid, ownContent);
    }
    let anchorUuid = firstBlock.uuid;

    // 6. Move children onto the page, in order, preserving UUIDs.
    const children = (block.children ?? []) as BlockEntity[];
    for (const child of children) {
      await logseq.Editor.moveBlock(child.uuid, anchorUuid, { children: false, before: false });
      anchorUuid = child.uuid; // keep sibling order
    }

    // 7. Handle the empty first block edge case.
    if (ownContent.length === 0 && children.length > 0) {
      await logseq.Editor.removeBlock(firstBlock.uuid);
    }

    // 8. Rewrite the original block in place to the embed.
    await logseq.Editor.updateBlock(block.uuid, `{{embed [[${pageName}]]}}`);

    // 9. Exit editing mode.
    await logseq.Editor.exitEditingMode();

    // 10. Remove collapsed property so the embed renders.
    if (block.properties?.collapsed) {
      await logseq.Editor.removeBlockProperty(block.uuid, "collapsed");
    }
  } catch (err) {
    console.error("zetlify error", err);
    logseq.UI.showMsg(`Zetlify failed: ${(err as Error).message}`, "error");
  }
}
