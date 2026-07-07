import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixture, runCli } from "./util";

const repo = mkdtempSync(path.join(tmpdir(), "rh-refresh-"));
afterAll(() => rmSync(repo, { recursive: true, force: true }));
const read = (rel: string) => readFileSync(path.join(repo, rel), "utf8");
const contextPath = ".iknowkungfu/docs/PROJECT_CONTEXT.md";

beforeAll(async () => {
  cpSync(fixture("nextjs-pnpm"), repo, { recursive: true });
  await runCli(["init", "--yes", "--cwd", repo]);
}, 60_000);

describe("iknowkungfu refresh (built binary)", () => {
  it("no-op on an unchanged repo; --check exits 0", async () => {
    const res = await runCli(["refresh", "--cwd", repo]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("up to date");
    expect((await runCli(["refresh", "--check", "--cwd", repo])).code).toBe(0);
  });

  it("after a dependency change: --check exits 1, refresh rewrites ONLY the stale blocks", async () => {
    const before = read(contextPath);
    // Add a format script → commands block changes; layout/entrypoints/conventions do not.
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    pkg.scripts.format = "prettier --write .";
    writeFileSync(path.join(repo, "package.json"), JSON.stringify(pkg, null, 2));

    const check = await runCli(["refresh", "--check", "--cwd", repo]);
    expect(check.code).toBe(1);
    expect(check.stdout).toContain("would refresh");
    expect(read(contextPath)).toBe(before); // --check wrote nothing

    const res = await runCli(["refresh", "--json", "--cwd", repo]);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { refreshed: Array<{ path: string; blocks: string[] }> };
    // Only the commands block is stale (the file header's manifest hash updates too, but block bodies are preserved).
    const docBlocks = parsed.refreshed.find((r) => r.path === contextPath)?.blocks;
    expect(docBlocks).toEqual(["commands"]);

    const after = read(contextPath);
    expect(after).toContain("| format | `pnpm format` |");
    // Non-stale blocks byte-identical:
    const block = (content: string, id: string) => content.split(`id=${id}`)[1]?.split("<!-- kungfu:end -->")[0];
    for (const id of ["layout", "entrypoints", "conventions"]) {
      expect(block(after, id), id).toBe(block(before, id));
    }
  });

  it("user edits outside blocks survive refresh", async () => {
    writeFileSync(path.join(repo, contextPath), `${read(contextPath)}\n## Local notes\nStaging deploys are manual.\n`);
    await runCli(["refresh", "--force", "--cwd", repo]);
    expect(read(contextPath)).toContain("Staging deploys are manual.");
  });
});

describe("iknowkungfu audit (built binary)", () => {
  it("clean harness → OK, exit 0", async () => {
    const res = await runCli(["audit", "--cwd", repo]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("audit: OK");
  });

  it("--untested lists uncovered core files", async () => {
    const res = await runCli(["audit", "--untested", "--cwd", repo]);
    expect(res.stdout).toContain("src/lib/payments/stripe.ts");
  });

  it("stale inputs → finding naming the fix, exit 1", async () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    pkg.scripts.newthing = "echo hi";
    writeFileSync(path.join(repo, "package.json"), JSON.stringify(pkg, null, 2));
    const res = await runCli(["audit", "--cwd", repo]);
    expect(res.code).toBe(1);
    expect(res.stdout).toContain("stale");
    expect(res.stdout).toContain("iknowkungfu refresh");
    await runCli(["refresh", "--cwd", repo]);
    expect((await runCli(["audit", "--cwd", repo])).code).toBe(0);
  });

  it("corrupted marker → integrity finding with --force fix", async () => {
    const original = read(contextPath);
    writeFileSync(path.join(repo, contextPath), original.replace("<!-- kungfu:end -->", ""));
    const res = await runCli(["audit", "--cwd", repo]);
    expect(res.code).toBe(1);
    expect(res.stdout).toContain("integrity");
    expect(res.stdout).toContain("--force");
    writeFileSync(path.join(repo, contextPath), original);
  });

  it("missing shim → presence finding pointing at adapt", async () => {
    rmSync(path.join(repo, ".cursor/rules/iknowkungfu.mdc"));
    const res = await runCli(["audit", "--cwd", repo]);
    expect(res.code).toBe(1);
    expect(res.stdout).toContain("missing: .cursor/rules/iknowkungfu.mdc");
    expect(res.stdout).toContain("iknowkungfu adapt");
    await runCli(["adapt", "--client", "cursor", "--cwd", repo]);
  });
});
