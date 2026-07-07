import { describe, expect, it } from "vitest";
import { parseManifest } from "@repo-harness/schemas";
import { scan } from "@repo-harness/core";
import { fixture } from "./util";

const manifest = parseManifest(await scan(fixture("nextjs-pnpm"), { now: new Date(0) }));
const commands = manifest.commands.commands;
const byKind = (kind: string) => commands.find((c) => c.kind === kind);

describe("detect: nextjs-pnpm fixture", () => {
  it("detects the package manager from the packageManager field", () => {
    expect(manifest.stack.packageManager).toEqual({
      value: "pnpm@9.6.0",
      provenance: "detected",
      source: "package.json#packageManager",
    });
  });

  it("detects frameworks with versions", () => {
    const values = manifest.stack.frameworks.map((f) => f.value);
    expect(values).toContain("nextjs@15.1.0");
    expect(values).toContain("react@19.0.0");
    expect(values).toContain("vitest@2.1.0");
    expect(values).toContain("playwright@1.48.0");
  });

  it("detects runtime from engines", () => {
    expect(manifest.stack.runtime?.value).toBe("node>=20");
    expect(manifest.stack.runtime?.provenance).toBe("detected");
  });

  it("builds the command catalog from scripts, provenance-tagged", () => {
    expect(byKind("install")?.command).toBe("pnpm install");
    expect(byKind("test")).toMatchObject({
      command: "pnpm test",
      provenance: "detected",
      source: "package.json#scripts.test",
    });
    expect(byKind("test-e2e")?.command).toBe("pnpm test:e2e");
    expect(byKind("test-e2e")?.notes).toMatch(/dev server/);
    expect(byKind("lint")?.command).toBe("pnpm lint");
    expect(byKind("typecheck")?.command).toBe("pnpm typecheck");
    expect(byKind("dev")?.command).toBe("pnpm dev");
    expect(byKind("build")?.command).toBe("pnpm build");
    expect(byKind("migrate")?.command).toBe("pnpm db:generate");
  });

  it("synthesizes inferred commands (test-file, lint-fix) and tags them", () => {
    expect(byKind("test-file")).toMatchObject({ command: "pnpm test {file}", provenance: "inferred" });
    expect(byKind("lint-fix")).toMatchObject({ command: "pnpm lint --fix", provenance: "inferred" });
  });

  it("one command per kind — no duplicates", () => {
    const kinds = commands.filter((c) => c.kind !== "custom").map((c) => c.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("reads env variable names (never values)", () => {
    expect(manifest.env.exampleFile).toBe(".env.example");
    expect(manifest.env.variables.map((v) => v.value)).toEqual([
      "DATABASE_URL",
      "STRIPE_SECRET_KEY",
      "NEXT_PUBLIC_APP_URL",
    ]);
    expect(JSON.stringify(manifest)).not.toContain("sk_test_xxx");
  });

  it("TypeScript is the dominant language", () => {
    expect(manifest.stack.languages[0]?.value.name).toBe("TypeScript");
  });

  it("is not a monorepo", () => {
    expect(manifest.stack.monorepo).toBeNull();
  });
});
