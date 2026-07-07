import type { Command } from "commander";
import {
  BlockCorruptionError,
  buildFileIndex,
  computeInputsHash,
  generateDocs,
  loadConfig,
  mergeArtifact,
  staleBlockIds,
} from "@repo-harness/core";
import { adapterArtifact } from "@repo-harness/adapters";
import { globalOpts } from "../context";
import { requireContext } from "./adapt";
import { readRepoFile } from "../write";

interface AuditFinding {
  check: string;
  problem: string;
  fix: string;
}

export function registerAudit(program: Command): void {
  program
    .command("audit")
    .description("Harness health: staleness, marker integrity, shim coverage, doc budgets")
    .option("--untested", "also list core files no test covers")
    .action(async (opts: { untested?: boolean }, cmd: Command) => {
      const g = globalOpts(cmd);
      const ctx = requireContext(g.root);
      const findings: AuditFinding[] = [];

      // 1. Manifest staleness vs tracked inputs.
      const loaded = loadConfig(g.root);
      const index = await buildFileIndex(g.root, { excludes: loaded.config.excludes });
      if (computeInputsHash(index, loaded.raw) !== ctx.manifest.inputsHash) {
        findings.push({ check: "staleness", problem: "manifest is stale vs tracked inputs", fix: "repo-harness refresh" });
      }
      // 2. Map built from this manifest.
      if (ctx.map.builtFromManifest !== ctx.manifest.inputsHash) {
        findings.push({ check: "map-sync", problem: "map.json was built from a different manifest", fix: "repo-harness refresh" });
      }
      // 3. Marker integrity + per-block staleness + budgets for docs and shims.
      const artifacts = [
        ...generateDocs(ctx.name, ctx.manifest, ctx.map, ctx.config),
        ...ctx.config.clients.map((c) => adapterArtifact(c, ctx)),
      ];
      for (const artifact of artifacts) {
        const existing = readRepoFile(g.root, artifact.path);
        if (existing === null) {
          findings.push({
            check: "presence",
            problem: `missing: ${artifact.path}`,
            fix: artifact.path.startsWith(".repo-harness/") ? "repo-harness refresh" : "repo-harness adapt",
          });
          continue;
        }
        try {
          mergeArtifact(existing, artifact, ctx.manifest.inputsHash); // throws on corrupted markers
          if (staleBlockIds(existing, artifact).length > 0) {
            findings.push({ check: "staleness", problem: `stale blocks in ${artifact.path}`, fix: "repo-harness refresh" });
          }
        } catch (e) {
          if (!(e instanceof BlockCorruptionError)) throw e;
          findings.push({ check: "integrity", problem: e.message, fix: "repo-harness refresh --force" });
        }
        if (existing.split("\n").length > artifact.lineBudget + 2) {
          findings.push({
            check: "budget",
            problem: `${artifact.path} exceeds its ${artifact.lineBudget}-line budget`,
            fix: "trim user additions or report an upstream bug",
          });
        }
      }

      if (g.json) {
        console.log(JSON.stringify({ findings, untested: opts.untested ? ctx.map.untested : undefined }));
      } else {
        if (findings.length === 0) console.log(`audit: OK (${ctx.manifest.inputsHash}) · ${artifacts.length} artifacts checked`);
        for (const f of findings) console.log(`✗ [${f.check}] ${f.problem}\n  fix: ${f.fix}`);
        if (opts.untested) {
          console.log(`\nuntested core files (${ctx.map.untested.length}):`);
          for (const u of ctx.map.untested) console.log(`  ${u}`);
        }
      }
      if (findings.length > 0) process.exitCode = 1;
    });
}
