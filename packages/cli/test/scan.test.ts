import { describe, expect, it } from "vitest";
import { parseManifest } from "@repo-harness/schemas";
import { fixture, runCli } from "./util";

describe("repo-harness scan (built binary)", () => {
  it("scan --print emits a schema-valid manifest", async () => {
    const res = await runCli(["scan", "--print", "--cwd", fixture("nextjs-pnpm")]);
    expect(res.code).toBe(0);
    const manifest = parseManifest(JSON.parse(res.stdout));
    expect(manifest.stack.packageManager?.value).toBe("pnpm@9.6.0");
    expect(manifest.commands.commands.length).toBeGreaterThan(5);
  });

  it("scan prints a human summary by default", async () => {
    const res = await runCli(["scan", "--cwd", fixture("nextjs-pnpm")]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("Repo Harness");
    expect(res.stdout).toContain("pnpm test");
    expect(res.stdout).toContain("detected");
  });

  it("bad --cwd exits 2 with a fix hint", async () => {
    const res = await runCli(["scan", "--cwd", fixture("does-not-exist")]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("fix:");
  });

  it("bad --cwd with --json emits a structured error on stdout", async () => {
    const res = await runCli(["scan", "--json", "--cwd", fixture("does-not-exist")]);
    expect(res.code).toBe(2);
    const parsed = JSON.parse(res.stdout) as { error: { code: string; fix: string } };
    expect(parsed.error.code).toBe("usage");
    expect(parsed.error.fix).toBeTruthy();
  });
});
