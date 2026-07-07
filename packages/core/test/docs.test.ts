import { describe, expect, it } from "vitest";
import { parseConfig } from "@repo-harness/schemas";
import { buildMap, generateDocs, inferRiskAreas, mergeArtifact, scan } from "@repo-harness/core";
import { fixture } from "./util";

const root = fixture("nextjs-pnpm");
const manifest = await scan(root, { now: new Date(0) });
const map = await buildMap(root, manifest);
const config = parseConfig({});
const docs = generateDocs("acme-shop", manifest, map, config);
const rendered = new Map(docs.map((d) => [d.id, mergeArtifact(null, d, manifest.inputsHash)]));

const pyRoot = fixture("fastapi-poetry");
const pyManifest = await scan(pyRoot, { now: new Date(0) });
const pyMap = await buildMap(pyRoot, pyManifest);
const pyDocs = generateDocs("fastapi-svc", pyManifest, pyMap, config);

describe("full doc set", () => {
  it("generates all six docs", () => {
    expect(docs.map((d) => d.id).sort()).toEqual([
      "agent-runbook",
      "debugging-playbooks",
      "project-context",
      "prompts",
      "refactor-guardrails",
      "test-oracle",
    ]);
  });

  it("every doc stays within its line budget on both fixtures", () => {
    for (const doc of [...docs, ...pyDocs]) {
      const content = mergeArtifact(null, doc, "x");
      expect(content.split("\n").length, doc.id).toBeLessThanOrEqual(doc.lineBudget);
      expect(doc.warnings, doc.id).toEqual([]);
    }
  });

  it("oracle: no phantom commands — every backtick command exists in the catalog or is a known CLI", () => {
    const oracle = rendered.get("test-oracle")!;
    const known = new Set([
      ...manifest.commands.commands.map((c) => c.command),
      ...manifest.commands.commands.map((c) => c.command.replace("{file}", "<its test>")),
    ]);
    for (const m of oracle.matchAll(/`([^`]+)`/g)) {
      const cmd = m[1]!;
      // Paths and placeholders in the left column aren't commands.
      if (cmd.startsWith("repo-harness") || cmd.includes("audit") || !cmd.includes(" ")) continue;
      expect(known.has(cmd), `phantom command: ${cmd}`).toBe(true);
    }
  });

  it("oracle: maps cart.ts to its test and flags untested files", () => {
    const oracle = rendered.get("test-oracle")!;
    expect(oracle).toContain("`src/lib/cart.ts` ← `tests/lib/cart.test.ts`");
    expect(oracle).toMatch(/⚠ \d+ core file\(s\) have NO covering test/);
  });

  it("playbooks: instantiated with the repo's real commands", () => {
    const pb = rendered.get("debugging-playbooks")!;
    expect(pb).toContain("pnpm test <file>");
    expect(pb).toContain("`pnpm typecheck`");
    expect(pb).toContain(".next/");
    expect(pb).toContain(".env.example");
  });

  it("guardrails: inferred payments+migrations areas appear with ⚠, plus blast radius and limits", () => {
    const gr = rendered.get("refactor-guardrails")!;
    expect(gr).toContain("`src/lib/payments/**`");
    expect(gr).toContain("⚠ inferred");
    expect(gr).toContain("never edit existing files");
    expect(gr).toContain("`src/lib/cart.ts` (4)");
    expect(gr).toContain("warning: >5 files or >150 lines");
  });

  it("prompts: parameterized and runbook-bound", () => {
    const pr = rendered.get("prompts")!;
    expect(pr).toContain("{DESCRIPTION}");
    expect(pr).toContain("repo-harness verify --changed");
    expect(pr.match(/^## /gm)?.length).toBe(3);
  });

  it("user-declared risk area overrides the inferred one with the same id", () => {
    const userConfig = parseConfig({
      riskAreas: [{ id: "payments", paths: ["src/lib/payments/**"], reason: "Stripe integration", rules: [{ kind: "tests-first" }] }],
    });
    const gr = mergeArtifact(null, generateDocs("acme-shop", manifest, map, userConfig).find((d) => d.id === "refactor-guardrails")!, "x");
    expect(gr).toContain("Stripe integration");
    expect(gr).not.toContain("money movement (name heuristic)");
  });
});

describe("inferred risk areas", () => {
  it("finds payments and migrations dirs by name, tagged inferred", () => {
    const areas = inferRiskAreas(map);
    const ids = areas.map((a) => a.id);
    expect(ids).toContain("payments");
    expect(ids).toContain("migrations");
    for (const a of areas) expect(a.provenance).toBe("inferred");
  });
});
