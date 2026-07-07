import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { VerificationResult } from "@iknowkungfu/schemas";
import { fixture, runCli } from "./util";

const repo = mkdtempSync(path.join(tmpdir(), "rh-verify-"));
afterAll(() => rmSync(repo, { recursive: true, force: true }));

function gitq(args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
}

beforeAll(async () => {
  cpSync(fixture("exec-node"), repo, { recursive: true });
  gitq(["init", "-q"]);
  gitq(["-c", "user.email=t@t", "-c", "user.name=t", "add", "-A"]);
  gitq(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"]);
  await runCli(["init", "--yes", "--clients", "agents-md", "--cwd", repo]);
}, 60_000);

describe("iknowkungfu verify (built binary, real execution)", () => {
  it("baseline passes on a green tree", async () => {
    const res = await runCli(["verify", "--baseline", "--json", "--cwd", repo]);
    expect(res.code).toBe(0);
    const result = JSON.parse(res.stdout) as VerificationResult;
    expect(result.verdict).toBe("pass");
    expect(result.commands.map((c) => c.status)).toEqual(["pass", "pass", "pass"]);
  });

  it("catches an intentionally broken change, scoped to its test, with a parsed failure", async () => {
    writeFileSync(path.join(repo, "src/calc.mjs"), "export function add(a, b) {\n  return a - b;\n}\n");
    const res = await runCli(["verify", "--changed", "--json", "--cwd", repo]);
    expect(res.code).toBe(1);
    const result = JSON.parse(res.stdout) as VerificationResult;
    expect(result.verdict).toBe("fail");
    expect(result.changedFiles).toContain("src/calc.mjs");
    const testRun = result.commands.find((c) => c.command.includes("tests/calc.test.mjs"));
    expect(testRun?.status).toBe("fail");
    expect(testRun?.failures[0]?.message).toContain("expected add(2, 3) to be 5");
    // Fix it back; verify goes green.
    writeFileSync(path.join(repo, "src/calc.mjs"), "export function add(a, b) {\n  return a + b;\n}\n");
    const fixed = await runCli(["verify", "--changed", "--cwd", repo]);
    expect(fixed.code).toBe(0);
  }, 60_000);

  it("times out a hung command and reports it, exit 1", async () => {
    mkdirSync(path.join(repo, ".iknowkungfu"), { recursive: true });
    writeFileSync(path.join(repo, "hang.mjs"), "setTimeout(() => {}, 60_000);\n");
    writeFileSync(
      path.join(repo, ".iknowkungfu/config.json"),
      JSON.stringify({ commandOverrides: [{ kind: "test", command: "node hang.mjs", source: "test-override" }] }),
    );
    await runCli(["scan", "--cwd", repo]); // config changed → refresh manifest
    const res = await runCli(["verify", "--full", "--timeout", "1", "--json", "--cwd", repo]);
    expect(res.code).toBe(1);
    const result = JSON.parse(res.stdout) as VerificationResult;
    expect(result.commands.find((c) => c.command === "node hang.mjs")?.status).toBe("timeout");
  }, 30_000);

  it("missing tool → status not-found and exit 3 (distinct from test failure)", async () => {
    writeFileSync(
      path.join(repo, ".iknowkungfu/config.json"),
      JSON.stringify({ commandOverrides: [{ kind: "test", command: "definitely-not-a-real-tool-xyz --run", source: "test-override" }] }),
    );
    await runCli(["scan", "--cwd", repo]);
    const res = await runCli(["verify", "--full", "--cwd", repo]);
    expect(res.code).toBe(3);
    expect(res.stderr).toContain("override the command");
    // Clean up the override for any later tests.
    writeFileSync(path.join(repo, ".iknowkungfu/config.json"), "{}");
    await runCli(["scan", "--cwd", repo]);
  }, 30_000);

  it("verify --changed outside a git repo exits 3", async () => {
    const bare = mkdtempSync(path.join(tmpdir(), "rh-nogit-"));
    cpSync(fixture("exec-node"), bare, { recursive: true });
    await runCli(["init", "--yes", "--clients", "agents-md", "--cwd", bare]);
    const res = await runCli(["verify", "--changed", "--cwd", bare]);
    expect(res.code).toBe(3);
    expect(res.stderr).toContain("git init");
    rmSync(bare, { recursive: true, force: true });
  }, 30_000);
});
