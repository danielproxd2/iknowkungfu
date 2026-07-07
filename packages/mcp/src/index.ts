import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { HARNESS_VERSION } from "@repo-harness/core";
import { registerActionTools, type ActionToolOptions } from "./action-tools";
import { registerReadTools } from "./read-tools";

export { invalidateStaleCache } from "./state";

export type ServerOptions = ActionToolOptions;

export function createServer(root: string, opts: ServerOptions = {}): McpServer {
  const server = new McpServer({ name: "repo-harness", version: HARNESS_VERSION });
  registerReadTools(server, root);
  registerActionTools(server, root, opts);
  return server;
}

export async function serveStdio(root: string, opts: ServerOptions = {}): Promise<void> {
  const server = createServer(root, opts);
  await server.connect(new StdioServerTransport());
}
