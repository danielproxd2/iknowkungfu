import { existsSync } from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { HARNESS_DIR, HarnessError } from "@iknowkungfu/core";
import { globalOpts } from "../context";
import { runPipeline, writeAdapters } from "../pipeline";

export function registerRefresh(program: Command): void {
  program
    .command("refresh")
    .description("Re-scan and rewrite only stale harness blocks (user edits outside blocks survive)")
    .option("--force", "rewrite all blocks from scratch")
    .option("--check", "exit 1 if anything WOULD change; write nothing (for CI/pre-commit)")
    .action(async (opts: { force?: boolean; check?: boolean }, cmd: Command) => {
      const g = globalOpts(cmd);
      if (!existsSync(path.join(g.root, HARNESS_DIR))) {
        throw new HarnessError("usage", `No ${HARNESS_DIR}/ here.`, "Run `iknowkungfu init` first.");
      }
      const dryRun = g.dryRun || opts.check === true;
      const { ctx, reports } = await runPipeline(g.root, { ...g, dryRun }, { force: opts.force });
      const adapterReports = writeAdapters(g.root, ctx, ctx.config.clients, { ...g, dryRun }, opts.force);
      const all = [...reports, ...adapterReports];
      const changed = all.filter((r) => r.action !== "unchanged");
      const refreshed = changed.map((r) => ({ path: r.path, blocks: r.refreshedBlocks }));
      const warnings = all.flatMap((r) => r.warnings);

      if (g.json) {
        console.log(
          JSON.stringify({
            refreshed,
            skipped: all.length - changed.length,
            manifestHash: ctx.manifest.inputsHash,
            check: opts.check ?? false,
            warnings,
          }),
        );
      } else if (!g.quiet) {
        if (changed.length === 0) console.log(`up to date (${ctx.manifest.inputsHash}) · ${all.length} artifacts checked`);
        else
          for (const r of refreshed)
            console.log(`${opts.check ? "would refresh" : "refreshed"}: ${r.path}${r.blocks.length > 0 ? ` [${r.blocks.join(", ")}]` : ""}`);
        for (const w of warnings) console.log(`⚠ ${w}`);
      }
      if (opts.check && changed.length > 0) process.exitCode = 1;
    });
}
