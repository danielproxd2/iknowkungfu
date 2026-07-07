import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fixture, runCli } from "./util";

const repo = mkdtempSync(path.join(tmpdir(), "rh-init-"));
cpSync(fixture("nextjs-pnpm"), repo, { recursive: true });
afterAll(() => rmSync(repo, { recursive: true, force: true }));

const read = (rel: string) => readFileSync(path.join(repo, rel), "utf8");

const SHIMS = [
  "AGENTS.md",
  "CLAUDE.md",
  ".codex/skills/repo-harness/SKILL.md",
  ".cursor/rules/repo-harness.mdc",
  ".github/copilot-instructions.md",
];

describe("repo-harness init (built binary)", () => {
  it("creates the full v0 file set with a summary", async () => {
    // Pre-existing user copilot instructions must survive.
    mkdirSync(path.join(repo, ".github"), { recursive: true });
    writeFileSync(path.join(repo, ".github/copilot-instructions.md"), "Always use tabs.\n");

    const res = await runCli(["init", "--yes", "--cwd", repo]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("✔ Detected:");
    expect(res.stdout).toContain(".mcp.json");

    for (const rel of [".repo-harness/config.json", ".repo-harness/manifest.json", ".repo-harness/map.json", ".repo-harness/docs/PROJECT_CONTEXT.md", ...SHIMS]) {
      expect(existsSync(path.join(repo, rel)), rel).toBe(true);
    }
    expect(read(".github/copilot-instructions.md")).toContain("Always use tabs.");
    expect(read(".github/copilot-instructions.md")).toContain("rh:begin id=copilot");
    expect(read("CLAUDE.md")).toContain("@AGENTS.md");
    expect(read(".codex/skills/repo-harness/SKILL.md")).toMatch(/^---\nname: repo-harness/);
    expect(read(".cursor/rules/repo-harness.mdc")).toMatch(/^---\ndescription: /);
  });

  it("every shim stays within the 30-line budget", () => {
    for (const rel of SHIMS) {
      expect(read(rel).split("\n").length, rel).toBeLessThanOrEqual(32);
    }
  });

  it("refuses a second init and points to refresh", async () => {
    const res = await runCli(["init", "--yes", "--cwd", repo]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("refresh");
  });
});

describe("repo-harness adapt (built binary)", () => {
  it("is idempotent", async () => {
    const res = await runCli(["adapt", "--cwd", repo]);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/unchanged: AGENTS\.md/);
    expect(res.stdout).not.toContain("written:");
  });

  it("--list reports status per client", async () => {
    const res = await runCli(["adapt", "--list", "--cwd", repo]);
    expect(res.stdout).toMatch(/agents-md\s+ok/);
    expect(res.stdout).toMatch(/cursor\s+ok/);
  });

  it("rejects unknown clients with exit 2", async () => {
    const res = await runCli(["adapt", "--client", "vscode-lol", "--cwd", repo]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("Valid clients");
  });

  it("--remove deletes owned files but only strips blocks from shared ones", async () => {
    await runCli(["adapt", "--remove", "cursor", "--cwd", repo]);
    expect(existsSync(path.join(repo, ".cursor/rules/repo-harness.mdc"))).toBe(false);

    await runCli(["adapt", "--remove", "copilot", "--cwd", repo]);
    const copilot = read(".github/copilot-instructions.md");
    expect(copilot).toContain("Always use tabs.");
    expect(copilot).not.toContain("rh:begin");

    // AGENTS.md is fully ours here → file removed entirely.
    await runCli(["adapt", "--remove", "agents-md", "--cwd", repo]);
    expect(existsSync(path.join(repo, "AGENTS.md"))).toBe(false);

    // Restore for later tests.
    const res = await runCli(["adapt", "--cwd", repo]);
    expect(res.stdout).toContain("written: AGENTS.md");
  });
});
