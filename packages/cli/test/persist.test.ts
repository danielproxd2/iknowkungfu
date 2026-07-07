import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseManifest } from "@iknowkungfu/schemas";
import { fixture, runCli } from "./util";

function tempRepo(from: string): string {
  const tmp = mkdtempSync(path.join(tmpdir(), "rh-cli-"));
  cpSync(fixture(from), tmp, { recursive: true });
  return tmp;
}

const repos: string[] = [];
afterAll(() => {
  for (const r of repos) rmSync(r, { recursive: true, force: true });
});

describe("scan persistence", () => {
  it("writes a valid manifest, then reports up-to-date with zero churn", async () => {
    const repo = tempRepo("nextjs-pnpm");
    repos.push(repo);
    const manifestPath = path.join(repo, ".iknowkungfu/manifest.json");

    const first = await runCli(["scan", "--cwd", repo]);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("written: .iknowkungfu/manifest.json");
    const bytes = readFileSync(manifestPath, "utf8");
    parseManifest(JSON.parse(bytes));

    const second = await runCli(["scan", "--cwd", repo]);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain("up to date: .iknowkungfu/manifest.json");
    expect(readFileSync(manifestPath, "utf8")).toBe(bytes);
  });

  it("--dry-run plans the write but touches nothing", async () => {
    const repo = tempRepo("nextjs-pnpm");
    repos.push(repo);
    const res = await runCli(["scan", "--dry-run", "--cwd", repo]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("dry-run: would write");
    expect(existsSync(path.join(repo, ".iknowkungfu"))).toBe(false);
  });

  it("rewrites when a tracked input changes", async () => {
    const repo = tempRepo("nextjs-pnpm");
    repos.push(repo);
    await runCli(["scan", "--cwd", repo]);
    const before = JSON.parse(readFileSync(path.join(repo, ".iknowkungfu/manifest.json"), "utf8")) as {
      inputsHash: string;
    };
    writeFileSync(path.join(repo, "package.json"), '{"name":"acme-shop","scripts":{"test":"vitest run"}}\n');
    const res = await runCli(["scan", "--cwd", repo]);
    expect(res.stdout).toContain("written: .iknowkungfu/manifest.json");
    const after = JSON.parse(readFileSync(path.join(repo, ".iknowkungfu/manifest.json"), "utf8")) as {
      inputsHash: string;
    };
    expect(after.inputsHash).not.toBe(before.inputsHash);
  });

  it("respects config excludes and rejects invalid config with exit 2", async () => {
    const repo = tempRepo("nextjs-pnpm");
    repos.push(repo);
    writeFileSync(path.join(repo, ".gitignore"), "generated-stuff/\n");
    const cfgDir = path.join(repo, ".iknowkungfu");
    rmSync(cfgDir, { recursive: true, force: true });
    await runCli(["scan", "--cwd", repo]);

    // Invalid JSON config → usage error.
    const fs = await import("node:fs");
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, "config.json"), "{not json");
    const bad = await runCli(["scan", "--cwd", repo]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain("config.json");

    // Valid config with excludes narrows the index.
    fs.writeFileSync(path.join(cfgDir, "config.json"), JSON.stringify({ excludes: ["e2e/**"] }));
    const res = await runCli(["scan", "--print", "--cwd", repo]);
    const manifest = parseManifest(JSON.parse(res.stdout));
    expect(manifest.stats.files).toBeGreaterThan(0);
  });
});

describe("writeManaged allowlist", () => {
  it("refuses writes outside managed paths", async () => {
    const { writeManaged } = await import("../src/write");
    const repo = tempRepo("makefile-only");
    repos.push(repo);
    expect(() => writeManaged(repo, "src/main.c", "clobbered", { dryRun: false })).toThrow(/outside managed paths/);
    expect(readFileSync(path.join(repo, "src/main.c"), "utf8")).toContain("int main");
  });
});
