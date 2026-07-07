import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, invalidateStaleCache } from "@repo-harness/mcp";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.resolve(here, "../../../fixtures", name);

// The nextjs fixture with a real harness, in a temp copy so we can go stale later.
const repo = mkdtempSync(path.join(tmpdir(), "rh-mcp-"));
afterAll(() => rmSync(repo, { recursive: true, force: true }));

let client: Client;

async function connect(root: string): Promise<Client> {
  const server = createServer(root);
  const c = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await c.connect(clientTransport);
  return c;
}

async function call(c: Client, name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await c.callTool({ name, arguments: args });
  const content = res.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0]!.text) as Record<string, unknown>;
}

beforeAll(async () => {
  cpSync(fixture("nextjs-pnpm"), repo, { recursive: true });
  // Build the harness via core (faster than spawning the CLI here).
  const { scan, buildMap } = await import("@repo-harness/core");
  const { mkdirSync, writeFileSync: wf } = await import("node:fs");
  const manifest = await scan(repo, {});
  const map = await buildMap(repo, manifest);
  mkdirSync(path.join(repo, ".repo-harness"), { recursive: true });
  wf(path.join(repo, ".repo-harness/manifest.json"), JSON.stringify(manifest));
  wf(path.join(repo, ".repo-harness/map.json"), JSON.stringify(map));
  client = await connect(repo);
}, 60_000);

describe("MCP read tools", () => {
  it("lists the expected tools and prompts", async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(["explain_file", "find_entrypoints", "find_tests_for_change", "get_commands", "repo_map"]);
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name).sort();
    expect(prompts).toEqual(["add-feature", "fix-bug", "review-diff"]);
  });

  it("repo_map: fresh meta, roles, dependents; dir narrowing", async () => {
    const all = await call(client, "repo_map", { depth: 3 });
    expect((all.meta as { stale: boolean }).stale).toBe(false);
    const nodes = all.nodes as Array<{ path: string; role: string; dependents?: number }>;
    expect(nodes.find((n) => n.path === "src/lib/cart.ts")).toMatchObject({ role: "core-logic", dependents: 4 });
    // Default depth keeps the top-level view small.
    const shallow = await call(client, "repo_map");
    expect((shallow.nodes as Array<{ path: string }>).every((n) => n.path.replace(/\/$/, "").split("/").length <= 2)).toBe(true);

    const narrowed = await call(client, "repo_map", { dir: "src/lib", depth: 3 });
    const paths = (narrowed.nodes as Array<{ path: string }>).map((n) => n.path);
    expect(paths).toContain("src/lib/payments/stripe.ts");
    expect(paths.every((p) => p.startsWith("src/lib"))).toBe(true);
  });

  it("explain_file: exports, dependents, tests, risk", async () => {
    const res = await call(client, "explain_file", { path: "src/lib/payments/stripe.ts" });
    expect(res.exports).toEqual(["charge"]);
    expect(res.tests).toEqual([]);
    expect(res.risk).toBe("payments");
    const cart = await call(client, "explain_file", { path: "src/lib/cart.ts" });
    expect((cart.dependents as string[]).length).toBe(4);
    expect(cart.tests).toContain("tests/lib/cart.test.ts");
  });

  it("explain_file: unknown path → structured error with fix", async () => {
    const res = await call(client, "explain_file", { path: "src/nope.ts" });
    expect((res.error as { fix: string }).fix).toContain("repo_map");
  });

  it("find_entrypoints filters by kind", async () => {
    const res = await call(client, "find_entrypoints", { kind: "script" });
    const eps = res.entrypoints as Array<{ path: string; how: string }>;
    expect(eps).toContainEqual(expect.objectContaining({ path: "scripts/seed.ts", how: "pnpm seed" }));
  });

  it("find_tests_for_change returns exact commands and uncovered files", async () => {
    const res = await call(client, "find_tests_for_change", { files: ["src/lib/cart.ts", "src/lib/payments/stripe.ts"] });
    expect(res.commands).toContain("pnpm test tests/lib/cart.test.ts");
    expect(res.uncovered).toEqual(["src/lib/payments/stripe.ts"]);
    expect(res.tests).toContainEqual(expect.objectContaining({ path: "tests/lib/cart.test.ts", reason: "imports-target" }));
  });

  it("get_commands returns the catalog verbatim", async () => {
    const res = await call(client, "get_commands");
    const commands = res.commands as Array<{ kind: string; command: string }>;
    expect(commands.find((c) => c.kind === "test")?.command).toBe("pnpm test");
  });

  it("stale manifest → every response says stale:true", async () => {
    writeFileSync(path.join(repo, "package.json"), '{"name":"acme-shop","scripts":{"test":"vitest run"}}\n');
    invalidateStaleCache();
    const fresh = await connect(repo);
    const res = await call(fresh, "get_commands");
    expect((res.meta as { stale: boolean }).stale).toBe(true);
  });

  it("no manifest → structured 'run init' error", async () => {
    const bare = await connect(fixture("makefile-only"));
    const res = await call(bare, "repo_map");
    expect((res.error as { fix: string }).fix).toContain("repo-harness init");
  });

  it("prompts render with the description substituted", async () => {
    const res = await client.getPrompt({ name: "fix-bug", arguments: { description: "cart total ignores discount" } });
    const text = (res.messages[0]!.content as { text: string }).text;
    expect(text).toContain("cart total ignores discount");
    expect(text).toContain("verify --changed");
  });
});
