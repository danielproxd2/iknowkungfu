import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import type { Command } from "commander";
import { CONFIG_PATH, HARNESS_DIR, HarnessError } from "@iknowkungfu/core";
import { MCP_JSON_SNIPPET } from "@iknowkungfu/adapters";
import { ALL_CLIENTS, type RiskArea } from "@iknowkungfu/schemas";
import { parseClients } from "./adapt";
import { globalOpts } from "../context";
import { runPipeline, writeAdapters } from "../pipeline";
import { summarizeStack } from "../output";
import { writeManaged } from "../write";

async function promptRiskAreas(): Promise<RiskArea[]> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(
      "Risk-area path globs to guard (comma-separated, e.g. src/payments/**) — the highest-value 30s of setup, empty to skip: ",
    );
    const paths = answer.split(",").map((p) => p.trim()).filter(Boolean);
    if (paths.length === 0) return [];
    const reason = (await rl.question("One-line reason (why are these risky?): ")).trim() || "user-declared risk area";
    return [{ id: "user-declared", paths, reason, provenance: "user", rules: [{ kind: "flag-in-report" }] }];
  } finally {
    rl.close();
  }
}

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("One-shot setup: scan, generate docs, write client adapters")
    .option("--yes", "no prompts, sensible defaults")
    .option("--clients <list>", "comma-separated clients", ALL_CLIENTS.join(","))
    .option("--no-mcp-hint", "skip the .mcp.json registration hint")
    .action(async (opts: { yes?: boolean; clients: string; mcpHint: boolean }, cmd: Command) => {
      const g = globalOpts(cmd);
      if (existsSync(path.join(g.root, HARNESS_DIR))) {
        throw new HarnessError("usage", `${HARNESS_DIR}/ already exists.`, "Run `iknowkungfu refresh` to update it.");
      }
      const clients = parseClients([opts.clients]);
      const riskAreas = !opts.yes && process.stdin.isTTY && !g.quiet ? await promptRiskAreas() : [];

      const config = { schemaVersion: 1, clients, ...(riskAreas.length > 0 ? { riskAreas } : {}) };
      writeManaged(g.root, CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { dryRun: g.dryRun });

      const { ctx, reports } = await runPipeline(g.root, g);
      const adapterReports = writeAdapters(g.root, ctx, clients, g);
      const all = [...reports, ...adapterReports];

      if (g.json) {
        console.log(JSON.stringify({ stack: ctx.manifest.stack, writes: all }));
        return;
      }
      if (g.quiet) return;
      const detected = ctx.manifest.commands.commands.filter((c) => c.provenance === "detected").length;
      const inferred = ctx.manifest.commands.commands.length - detected;
      console.log(`iknowkungfu v${ctx.manifest.harnessVersion} — init`);
      console.log(`✔ Detected: ${summarizeStack(ctx.manifest)}`);
      console.log(`✔ Command catalog: ${detected} detected, ${inferred} inferred`);
      console.log(`✔ Mapped ${ctx.map.files.length} files · ${ctx.map.entrypoints.length} entrypoints`);
      if (ctx.map.untested.length > 0) console.log(`⚠ ${ctx.map.untested.length} core file(s) without tests`);
      console.log("");
      for (const r of all) console.log(`  ${r.action === "dry-run" ? "would write" : r.action}: ${r.path}`);
      for (const r of all) for (const w of r.warnings) console.log(`  ⚠ ${w}`);
      if (clients.includes("claude") && opts.mcpHint) {
        console.log(`\nClaude Code MCP: merge into .mcp.json → ${MCP_JSON_SNIPPET}`);
      }
      console.log("\nDone. Commit .iknowkungfu/ and the shims — your whole team's agents get them for free.");
    });
}
