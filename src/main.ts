import "@logseq/libs";
import { zetlify } from "./zetlify";

function main() {
  logseq.Editor.registerSlashCommand("Zetlify", async (e) => zetlify(e.uuid));
}

logseq.ready(main).catch(console.error);
