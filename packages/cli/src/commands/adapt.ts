import path from "node:path";
import type { Command } from "commander";
import { HarnessError, loadConfig, removeBlock, staleBlockIds, type DocContext } from "@repo-harness/core";
import { adapterArtifact, adapterPath, MCP_JSON_SNIPPET } from "@repo-harness/adapters";
import { ALL_CLIENTS, type Client } from "@repo-harness/schemas";
import { globalOpts, type GlobalOpts } from "../context";
import { readManifest, readMap } from "../manifest-io";
import { writeAdapters } from "../pipeline";
import { deleteManaged, readRepoFile, writeManaged } from "../write";

export function parseClients(values: string[]): Client[] {
  const clients: Client[] = [];
  for (const v of values.flatMap((x) => x.split(","))) {
    const name = v.trim();
    if (name === "") continue;
    if (!(ALL_CLIENTS as string[]).includes(name)) {
      throw new HarnessError("usage", `Unknown client: ${name}`, `Valid clients: ${ALL_CLIENTS.join(", ")}`);
    }
    clients.push(name as Client);
  }
  return clients;
}

export function requireContext(root: string): DocContext {
  const manifest = readManifest(root);
  const map = readMap(root);
  if (!manifest || !map) throw new HarnessError("usage", "No manifest/map found.", "Run `repo-harness init` first.");
  return { name: path.basename(root), manifest, map, config: loadConfig(root).config };
}

function removeClient(root: string, client: Client, g: GlobalOpts): string {
  const target = adapterPath(client);
  const existing = readRepoFile(root, target);
  if (existing === null) return `not present: ${target}`;
  const artifact = adapterArtifact(client, requireContext(root));
  if (artifact.ownership === "owned-verbatim") {
    deleteManaged(root, target, { dryRun: g.dryRun });
    return `removed: ${target}`;
  }
  const remaining = removeBlock(target, existing, artifact.blocks[0]?.id ?? client);
  if (remaining === null) {
    deleteManaged(root, target, { dryRun: g.dryRun });
    return `removed: ${target}`;
  }
  writeManaged(root, target, remaining, { dryRun: g.dryRun });
  return `removed harness block from: ${target} (user content kept)`;
}

export function registerAdapt(program: Command): void {
  program
    .command("adapt")
    .description("Write client shims (AGENTS.md, CLAUDE.md, Codex skill, Cursor rule, Copilot instructions)")
    .option("--client <name...>", "clients to adapt (default: config.clients)")
    .option("--list", "show adapter status without writing")
    .option("--remove <name>", "remove a client's shim (or its harness block)")
    .action((opts: { client?: string[]; list?: boolean; remove?: string }, cmd: Command) => {
      const g = globalOpts(cmd);

      if (opts.list) {
        const ctx = requireContext(g.root);
        for (const client of ALL_CLIENTS) {
          const artifact = adapterArtifact(client, ctx);
          const existing = readRepoFile(g.root, artifact.path);
          const status = existing === null ? "missing" : staleBlockIds(existing, artifact).length > 0 ? "stale" : "ok";
          console.log(`${client.padEnd(10)} ${status.padEnd(8)} ${artifact.path}`);
        }
        return;
      }

      if (opts.remove) {
        const [client] = parseClients([opts.remove]);
        if (!client) throw new HarnessError("usage", "No client given to --remove.", `Valid: ${ALL_CLIENTS.join(", ")}`);
        console.log(removeClient(g.root, client, g));
        return;
      }

      const ctx = requireContext(g.root);
      const clients = opts.client ? parseClients(opts.client) : ctx.config.clients;
      const reports = writeAdapters(g.root, ctx, clients, g);
      if (g.json) {
        console.log(JSON.stringify({ adapters: reports }));
        return;
      }
      if (!g.quiet) {
        for (const r of reports) console.log(`${r.action}: ${r.path}`);
        if (clients.includes("claude")) {
          console.log(`\nClaude Code MCP: merge into .mcp.json → ${MCP_JSON_SNIPPET}`);
        }
      }
    });
}
