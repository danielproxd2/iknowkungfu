import type { Command } from "commander";
import { HarnessError, loadConfig } from "@repo-harness/core";
import { globalOpts } from "../context";
import { docsFor, writeArtifacts } from "../generate";
import { readManifest, readMap } from "../manifest-io";

export function registerGenerate(program: Command): void {
  program
    .command("generate")
    .description("Render harness docs from the current manifest and map")
    .option("--force", "rewrite all blocks, discarding existing block bodies")
    .action((opts: { force?: boolean }, cmd: Command) => {
      const g = globalOpts(cmd);
      const manifest = readManifest(g.root);
      const map = readMap(g.root);
      if (!manifest || !map) {
        throw new HarnessError("usage", "No manifest/map found.", "Run `repo-harness scan` (or `init`) first.");
      }
      const { config } = loadConfig(g.root);
      const reports = writeArtifacts(g.root, docsFor(g.root, manifest, map, config), {
        dryRun: g.dryRun,
        force: opts.force,
      });
      if (g.json) {
        console.log(JSON.stringify({ artifacts: reports }));
        return;
      }
      if (!g.quiet) {
        for (const r of reports) {
          const blocks = r.refreshedBlocks.length > 0 ? ` [${r.refreshedBlocks.join(", ")}]` : "";
          console.log(`${r.action}: ${r.path}${blocks}`);
          for (const w of r.warnings) console.log(`  ⚠ ${w}`);
        }
      }
    });
}
