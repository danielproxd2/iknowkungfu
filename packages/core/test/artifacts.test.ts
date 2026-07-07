import { describe, expect, it } from "vitest";
import { parseConfig } from "@repo-harness/schemas";
import {
  BlockCorruptionError,
  buildMap,
  generateDocs,
  mergeArtifact,
  scan,
  staleBlockIds,
  type GeneratedArtifact,
} from "@repo-harness/core";
import { fixture } from "./util";

const root = fixture("nextjs-pnpm");
const manifest = await scan(root, { now: new Date(0) });
const map = await buildMap(root, manifest);
const config = parseConfig({
  riskAreas: [
    { id: "payments", paths: ["src/lib/payments/**"], reason: "money movement", rules: [{ kind: "tests-first" }] },
    { id: "db", paths: ["src/db/migrations/**"], reason: "append-only migrations", rules: [{ kind: "never-edit" }] },
  ],
});
const [projectContext, runbook] = generateDocs("acme-shop", manifest, map, config) as [GeneratedArtifact, GeneratedArtifact];
const pcContent = mergeArtifact(null, projectContext, manifest.inputsHash);
const rbContent = mergeArtifact(null, runbook, manifest.inputsHash);

describe("PROJECT_CONTEXT.md", () => {
  it("contains exact commands, layout, entrypoints, and risk marks", () => {
    expect(pcContent).toContain("# Project Context: acme-shop");
    expect(pcContent).toContain("| test | `pnpm test` |");
    expect(pcContent).toContain("inferred");
    expect(pcContent).toContain("`src/lib/cart.ts` (4 dependents)");
    expect(pcContent).toContain("Env vars (3): see `.env.example`");
    expect(pcContent).toMatchSnapshot();
  });

  it("stays within its line budget", () => {
    expect(pcContent.split("\n").length).toBeLessThanOrEqual(projectContext.lineBudget);
    expect(projectContext.warnings).toEqual([]);
  });
});

describe("AGENT_RUNBOOK.md", () => {
  it("encodes the loop with real commands and never-edit paths", () => {
    expect(rbContent).toContain("repo-harness verify --changed");
    expect(rbContent).toContain("`pnpm typecheck`");
    expect(rbContent).toContain("More than 5 files or 150 changed lines");
    expect(rbContent).toContain("src/db/migrations/**");
    expect(rbContent.split("\n").length).toBeLessThanOrEqual(runbook.lineBudget);
    expect(rbContent).toMatchSnapshot();
  });
});

describe("marker-block merge semantics", () => {
  it("is idempotent", () => {
    expect(mergeArtifact(pcContent, projectContext, manifest.inputsHash)).toBe(pcContent);
    expect(staleBlockIds(pcContent, projectContext)).toEqual([]);
  });

  it("preserves user text outside blocks", () => {
    const edited = `${pcContent}\n## My notes\nDeploy on Fridays only.\n`;
    const merged = mergeArtifact(edited, projectContext, manifest.inputsHash);
    expect(merged).toContain("Deploy on Fridays only.");
  });

  it("rewrites only the stale block when one input changes", () => {
    const bumped: GeneratedArtifact = {
      ...projectContext,
      blocks: projectContext.blocks.map((b) =>
        b.id === "commands" ? { ...b, inputs: "changed000000", content: "## Commands (exact — do not improvise)\nnew table" } : b,
      ),
    };
    expect(staleBlockIds(pcContent, bumped)).toEqual(["commands"]);
    const merged = mergeArtifact(pcContent, bumped, manifest.inputsHash);
    expect(merged).toContain("new table");
    expect(merged).toContain("# Project Context: acme-shop"); // identity untouched
  });

  it("keeps existing block bodies when inputs match (byte stability over template drift)", () => {
    const templateDrift: GeneratedArtifact = {
      ...projectContext,
      blocks: projectContext.blocks.map((b) => (b.id === "identity" ? { ...b, content: "DIFFERENT RENDER" } : b)),
    };
    expect(mergeArtifact(pcContent, templateDrift, manifest.inputsHash)).toBe(pcContent);
  });

  it("throws BlockCorruptionError on unbalanced markers", () => {
    const corrupted = pcContent.replace("<!-- rh:end -->", "");
    expect(() => mergeArtifact(corrupted, projectContext, manifest.inputsHash)).toThrow(BlockCorruptionError);
  });
});
