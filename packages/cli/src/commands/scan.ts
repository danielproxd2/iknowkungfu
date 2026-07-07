import type { Command } from "commander";
import { scan } from "@repo-harness/core";
import { globalOpts } from "../context";
import { readManifest, writeManifest } from "../manifest-io";
import { printScanSummary } from "../output";

export function registerScan(program: Command): void {
  program
    .command("scan")
    .description("Detect stack, commands, and structure; write .repo-harness/manifest.json")
    .option("--print", "print manifest JSON to stdout, write nothing")
    .option("--timing", "print scan duration")
    .action(async (opts: { print?: boolean; timing?: boolean }, cmd: Command) => {
      const g = globalOpts(cmd);
      const started = Date.now();
      const manifest = await scan(g.root, {});
      if (opts.timing) console.error(`scan: ${Date.now() - started}ms`);

      if (opts.print) {
        console.log(JSON.stringify(manifest, null, 2));
        return;
      }

      const result = writeManifest(g.root, manifest, { dryRun: g.dryRun });
      const effective = result.fresh ? manifest : (readManifest(g.root) ?? manifest);
      if (g.json) {
        console.log(JSON.stringify({ manifest: effective, write: result }));
        return;
      }
      if (!g.quiet) {
        printScanSummary(effective);
        console.log("");
        const note = { written: "manifest written", unchanged: "manifest up to date", "dry-run": "dry-run: would write" }[
          result.action
        ];
        console.log(`${note}: ${result.path} (${effective.inputsHash})`);
      }
    });
}
