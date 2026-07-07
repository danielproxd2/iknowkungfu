import type { Command } from "commander";
import { scan } from "@repo-harness/core";
import { globalOpts } from "../context";
import { printScanSummary } from "../output";

export function registerScan(program: Command): void {
  program
    .command("scan")
    .description("Detect stack, commands, and structure")
    .option("--print", "print manifest JSON to stdout, write nothing")
    .option("--timing", "print scan duration")
    .action(async (opts: { print?: boolean; timing?: boolean }, cmd: Command) => {
      const g = globalOpts(cmd);
      const started = Date.now();
      const manifest = await scan(g.root, {});
      if (opts.timing) console.error(`scan: ${Date.now() - started}ms`);
      if (opts.print || g.json) {
        console.log(JSON.stringify(manifest, null, 2));
        return;
      }
      if (!g.quiet) printScanSummary(manifest);
    });
}
