import type { Command } from "commander";
import { serveStdio } from "@repo-harness/mcp";
import { globalOpts } from "../context";

export function registerMcp(program: Command): void {
  program
    .command("mcp")
    .description("Serve the repo-harness MCP server over stdio (launched by MCP clients)")
    .option("--readonly", "disable refresh_context")
    .action(async (opts: { readonly?: boolean }, cmd: Command) => {
      const g = globalOpts(cmd);
      // Serve even without a manifest: tools return a structured "run init" error,
      // which is better client UX than a dead server.
      await serveStdio(g.root, { readonly: opts.readonly });
    });
}
