import type { Command } from "commander";
import { changedFiles, planVerify, runVerify, HarnessError, type VerifyScope } from "@iknowkungfu/core";
import { requireContext } from "./adapt";
import { globalOpts } from "../context";

export function registerVerify(program: Command): void {
  program
    .command("verify")
    .description("Run the right checks for a changeset; structured pass/fail")
    .option("--changed", "scope to uncommitted changes (default)")
    .option("--full", "run the full check suite")
    .option("--baseline", "verify the tree is green before starting work")
    .option("--files <paths...>", "explicit changed files (overrides git detection)")
    .option("--timeout <sec>", "per-command timeout in seconds", "600")
    .action(
      async (
        opts: { changed?: boolean; full?: boolean; baseline?: boolean; files?: string[]; timeout: string },
        cmd: Command,
      ) => {
        const g = globalOpts(cmd);
        const ctx = requireContext(g.root);
        const scope: VerifyScope = opts.full ? "full" : opts.baseline ? "baseline" : "changed";
        const timeoutSec = Number(opts.timeout);
        if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
          throw new HarnessError("usage", `Invalid --timeout: ${opts.timeout}`, "Pass a positive number of seconds.");
        }

        const changed =
          scope !== "changed" ? [] : opts.files && opts.files.length > 0 ? opts.files : await changedFiles(g.root);
        const plan = planVerify(scope, changed, ctx.manifest, ctx.map);
        const stream = !g.json && !g.quiet;
        const result = await runVerify(g.root, plan, {
          timeoutMs: timeoutSec * 1000,
          onOutput: stream ? (c) => process.stderr.write(c) : undefined,
        });

        if (g.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (!g.quiet || result.verdict !== "pass") {
          console.log(`\nverify (${scope}): ${result.verdict.toUpperCase()} in ${result.totalDurationMs}ms`);
          for (const n of plan.notes) console.log(`  note: ${n}`);
          for (const c of result.commands) {
            console.log(`  ${c.status.padEnd(9)} ${c.command} (${c.durationMs}ms)`);
            for (const f of c.failures.slice(0, 5)) console.log(`    ✗ ${f.message}`);
          }
          if (result.uncovered.length > 0) {
            console.log(`  ⚠ no test covers: ${result.uncovered.join(", ")} — state this in your report`);
          }
        }

        if (result.commands.some((c) => c.status === "not-found")) {
          throw new HarnessError(
            "env",
            "A catalog command was not found on this machine.",
            "Install the missing tool (see output above) or override the command in .iknowkungfu/config.json.",
          );
        }
        if (result.verdict === "fail") process.exitCode = 1;
      },
    );
}
