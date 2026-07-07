import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { riskReportSchema, verificationResultSchema } from "@iknowkungfu/schemas";
import { createServer, invalidateStaleCache } from "@iknowkungfu/mcp";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.resolve(here, "../../../fixtures", name);
const BIN = path.resolve(here, "../../cli/dist/index.js");

const repo = mkdtempSync(path.join(tmpdir(), "rh-mcpact-"));
afterAll(() => rmSync(repo, { recursive: true, force: true }));

function gitq(args: string[]): void {
  execFileSync("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", ...args], { stdio: "ignore" });
}

let client: Client;

async function connect(opts: Record<string, unknown> = {}): Promise<Client> {
  const server = createServer(repo, { cliPath: BIN, ...opts });
  const c = new Client({ name: "test", version: "0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await c.connect(ct);
  return c;
}

async function call(c: Client, name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await c.callTool({ name, arguments: args });
  return JSON.parse((res.content as Array<{ text: string }>)[0]!.text) as Record<string, unknown>;
}

beforeAll(async () => {
  cpSync(fixture("exec-node"), repo, { recursive: true });
  gitq(["init", "-q"]);
  gitq(["add", "-A"]);
  gitq(["commit", "-qm", "base"]);
  execFileSync(process.execPath, [BIN, "init", "--yes", "--clients", "agents-md", "--cwd", repo], { stdio: "ignore" });
  gitq(["add", "-A"]);
  gitq(["commit", "-qm", "harness"]);
  invalidateStaleCache();
  client = await connect();
}, 60_000);

describe("MCP action tools", () => {
  it("verify_change catches a real break and reports structured failures", async () => {
    writeFileSync(path.join(repo, "src/calc.mjs"), "export function add(a, b) {\n  return a - b;\n}\n");
    const res = await call(client, "verify_change", { scope: "changed" });
    verificationResultSchema.parse(res); // response is schema-valid (extra keys stripped)
    expect(res.verdict).toBe("fail");
    const cmds = res.commands as Array<{ command: string; status: string; failures: Array<{ message: string }> }>;
    const failed = cmds.find((c) => c.status === "fail");
    expect(failed?.failures[0]?.message).toContain("expected add(2, 3) to be 5");
    writeFileSync(path.join(repo, "src/calc.mjs"), "export function add(a, b) {\n  return a + b;\n}\n");
    const green = await call(client, "verify_change", { scope: "baseline" });
    expect(green.verdict).toBe("pass");
  }, 60_000);

  it("risk_check_diff flags a staged test deletion as a blocker", async () => {
    rmSync(path.join(repo, "tests/calc.test.mjs"));
    gitq(["add", "-A"]);
    const res = await call(client, "risk_check_diff", {});
    riskReportSchema.parse(res);
    expect(res.verdict).toBe("blocked");
    expect((res.findings as Array<{ rule: string }>).map((f) => f.rule)).toContain("test-deleted");
    gitq(["reset", "--hard", "HEAD"]);
  });

  it("plan_small_pr returns template steps with verify commands", async () => {
    const res = await call(client, "plan_small_pr", { task: "extend calc with multiply", touchHint: ["src/calc.mjs"] });
    expect(res.planQuality).toBe("template");
    const steps = res.steps as Array<{ title: string; verify: string[] }>;
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]!.verify.join(" ")).toContain("npm");
  });

  it("refresh_context heals staleness by shelling out to the CLI", async () => {
    const pkg = { name: "exec-node", private: true, scripts: { test: "node run-tests.mjs", typecheck: "node checks/typecheck.mjs", lint: "node checks/lint.mjs", extra: "node checks/lint.mjs" }, devDependencies: { vitest: "^2.0.0" } };
    writeFileSync(path.join(repo, "package.json"), JSON.stringify(pkg, null, 2));
    invalidateStaleCache();

    const before = await call(client, "get_commands");
    expect((before.meta as { stale: boolean }).stale).toBe(true);

    const res = await call(client, "refresh_context", {});
    expect(res.refreshed).toBeDefined();

    const after = await call(client, "get_commands");
    expect((after.meta as { stale: boolean }).stale).toBe(false);
  }, 60_000);

  it("readonly server does not expose refresh_context", async () => {
    const ro = await connect({ readonly: true });
    const tools = (await ro.listTools()).tools.map((t) => t.name);
    expect(tools).toContain("verify_change");
    expect(tools).not.toContain("refresh_context");
  });
});
