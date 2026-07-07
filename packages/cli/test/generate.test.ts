import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fixture, runCli } from "./util";

const repo = mkdtempSync(path.join(tmpdir(), "rh-gen-"));
cpSync(fixture("nextjs-pnpm"), repo, { recursive: true });
afterAll(() => rmSync(repo, { recursive: true, force: true }));

const docPath = path.join(repo, ".repo-harness/docs/PROJECT_CONTEXT.md");

describe("repo-harness generate (built binary)", () => {
  it("requires a scan first", async () => {
    const res = await runCli(["generate", "--cwd", repo]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("scan");
  });

  it("writes both docs after scan, then reports unchanged", async () => {
    await runCli(["scan", "--cwd", repo]);
    const first = await runCli(["generate", "--cwd", repo]);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("written: .repo-harness/docs/PROJECT_CONTEXT.md");
    expect(first.stdout).toContain("written: .repo-harness/docs/AGENT_RUNBOOK.md");
    expect(readFileSync(docPath, "utf8")).toContain("pnpm test");

    const second = await runCli(["generate", "--cwd", repo]);
    expect(second.stdout).toContain("unchanged: .repo-harness/docs/PROJECT_CONTEXT.md");
  });

  it("preserves user edits outside blocks across regeneration", async () => {
    writeFileSync(docPath, `${readFileSync(docPath, "utf8")}\n## Team notes\nAsk Dana about payments.\n`);
    await runCli(["generate", "--cwd", repo]);
    expect(readFileSync(docPath, "utf8")).toContain("Ask Dana about payments.");
  });

  it("reports corruption with a --force fix, and --force repairs", async () => {
    const original = readFileSync(docPath, "utf8");
    writeFileSync(docPath, original.replace("<!-- rh:end -->", ""));
    const res = await runCli(["generate", "--cwd", repo]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--force");

    const forced = await runCli(["generate", "--force", "--cwd", repo]);
    expect(forced.code).toBe(0);
    expect(readFileSync(docPath, "utf8")).toContain("# Project Context");
  });
});
