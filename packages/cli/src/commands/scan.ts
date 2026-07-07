import type { Command } from "commander";
import { buildMap, loadConfig, scan } from "@repo-harness/core";
import { globalOpts } from "../context";
import { readManifest, writeManifest, writeMap } from "../manifest-io";
import { printScanSummary } from "../output";

export function registerScan(program: Command): void {
  program
    .command("scan")
    .description("Detect stack, commands, and structure; write .repo-harness/{manifest,map}.json")
    .option("--print", "print manifest JSON to stdout, write nothing")
    .option("--timing", "print scan duration")
    .action(async (opts: { print?: boolean; timing?: boolean }, cmd: Command) => {
      const g = globalOpts(cmd);
      const started = Date.now();
      const loaded = loadConfig(g.root);
      const manifest = await scan(g.root, { loaded });
      if (opts.print) {
        if (opts.timing) console.error(`scan: ${Date.now() - started}ms`);
        console.log(JSON.stringify(manifest, null, 2));
        return;
      }

      const manifestResult = writeManifest(g.root, manifest, { dryRun: g.dryRun });
      const effective = manifestResult.fresh ? manifest : (readManifest(g.root) ?? manifest);
      const map = await buildMap(g.root, effective, { loaded });
      const mapResult = writeMap(g.root, map, { dryRun: g.dryRun });
      if (opts.timing) console.error(`scan+map: ${Date.now() - started}ms`);

      if (g.json) {
        console.log(JSON.stringify({ manifest: effective, writes: [manifestResult, mapResult] }));
        return;
      }
      if (!g.quiet) {
        printScanSummary(effective);
        console.log("");
        const describe = { written: "written", unchanged: "up to date", "dry-run": "dry-run: would write" };
        for (const r of [manifestResult, mapResult]) console.log(`${describe[r.action]}: ${r.path}`);
        console.log(`inputsHash: ${effective.inputsHash} · mapped files: ${map.files.length} · untested: ${map.untested.length}`);
      }
    });
}
