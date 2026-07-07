import type { Command } from "commander";
import { parseDiff, riskCheck } from "@iknowkungfu/core";
import { requireContext } from "./adapt";
import { globalOpts } from "../context";
import { table } from "../output";

export function registerRisk(program: Command): void {
  program
    .command("risk")
    .description("Deterministic risk report for a diff (staged by default)")
    .option("--staged", "check the staged diff (default)")
    .option("--range <range>", "check a git range, e.g. main..HEAD")
    .option("--strict", "warnings also exit 1 (for CI/pre-commit)")
    .action(async (opts: { staged?: boolean; range?: string; strict?: boolean }, cmd: Command) => {
      const g = globalOpts(cmd);
      const ctx = requireContext(g.root);
      const files = await parseDiff(g.root, opts.range ?? null);
      const report = riskCheck(files, opts.range ?? "staged", { map: ctx.map, config: ctx.config });

      if (g.json) {
        console.log(JSON.stringify(report, null, 2));
      } else if (!g.quiet || report.verdict !== "clean") {
        const s = report.summary;
        console.log(`risk (${report.range}): ${report.verdict.toUpperCase()} — ${s.files} files, +${s.insertions}/-${s.deletions}`);
        if (files.length === 0) console.log("  note: empty diff (stage changes with `git add` first?)");
        if (report.findings.length > 0) {
          console.log("");
          console.log(
            table([
              ["SEVERITY", "RULE", "FILE", "MESSAGE"],
              ...report.findings.map((f) => [f.severity, f.rule, f.file ?? "-", f.message]),
            ]),
          );
          console.log("");
          for (const f of report.findings.filter((x) => x.severity !== "info")) console.log(`  → ${f.suggestion}`);
        }
      }

      if (report.verdict === "blocked" || (opts.strict && report.verdict === "warnings")) process.exitCode = 1;
    });
}
