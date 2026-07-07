import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RiskReport } from "@repo-harness/schemas";
import { fixture, runCli } from "./util";

const repo = mkdtempSync(path.join(tmpdir(), "rh-risk-"));
afterAll(() => rmSync(repo, { recursive: true, force: true }));

function gitq(args: string[]): void {
  execFileSync("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", ...args], { stdio: "ignore" });
}

beforeAll(async () => {
  cpSync(fixture("exec-node"), repo, { recursive: true });
  gitq(["init", "-q"]);
  gitq(["add", "-A"]);
  gitq(["commit", "-qm", "base"]);
  await runCli(["init", "--yes", "--clients", "agents-md", "--cwd", repo]);
  gitq(["add", "-A"]);
  gitq(["commit", "-qm", "harness"]);
}, 60_000);

describe("repo-harness risk (built binary, real git)", () => {
  it("empty staged diff → clean, exit 0", async () => {
    const res = await runCli(["risk", "--cwd", repo]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("CLEAN");
  });

  it("staged test deletion + debug statement → blocked, exit 1, suggestions included", async () => {
    unlinkSync(path.join(repo, "tests/calc.test.mjs"));
    writeFileSync(path.join(repo, "src/calc.mjs"), 'export function add(a, b) {\n  console.log("dbg", a);\n  return a + b;\n}\n');
    gitq(["add", "-A"]);

    const res = await runCli(["risk", "--json", "--cwd", repo]);
    expect(res.code).toBe(1);
    const report = JSON.parse(res.stdout) as RiskReport;
    expect(report.verdict).toBe("blocked");
    const ruleNames = report.findings.map((f) => f.rule);
    expect(ruleNames).toContain("test-deleted");
    expect(ruleNames).toContain("debug-statement");
    expect(report.findings[0]?.suggestion).toBeTruthy();

    gitq(["reset", "--hard", "HEAD"]);
  });

  it("--strict makes warnings exit 1; --range works", async () => {
    writeFileSync(path.join(repo, "src/calc.mjs"), 'export function add(a, b) {\n  console.log("x");\n  return a + b;\n}\n');
    gitq(["add", "-A"]);
    gitq(["commit", "-qm", "warned"]);

    const relaxed = await runCli(["risk", "--range", "HEAD~1..HEAD", "--cwd", repo]);
    expect(relaxed.code).toBe(0);
    expect(relaxed.stdout).toContain("WARNINGS");

    const strict = await runCli(["risk", "--range", "HEAD~1..HEAD", "--strict", "--cwd", repo]);
    expect(strict.code).toBe(1);
  });
});
