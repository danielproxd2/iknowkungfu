import type { HarnessConfig, ProjectMap, RepoManifest } from "@iknowkungfu/schemas";
import { pathInArea } from "../artifacts/context";
import { effectiveRiskAreas } from "../risk/areas";

export interface PrStep {
  title: string;
  files: string[];
  verify: string[];
  riskNotes: string[];
}

export interface PrPlan {
  task: string;
  steps: PrStep[];
  splitRequired: boolean;
  planQuality: "template" | "llm";
  notes: string[];
}

interface PlanContext {
  manifest: RepoManifest;
  map: ProjectMap;
  config: HarnessConfig;
}

/** Deterministic template planner — LLM refinement is a post-v0 enrichment. */
export function planSmallPr(task: string, touchHint: string[], ctx: PlanContext): PrPlan {
  const byKind = new Map(ctx.manifest.commands.commands.map((c) => [c.kind, c.command]));
  const areas = effectiveRiskAreas(ctx.config, ctx.map);
  const nodes = new Map(ctx.map.files.map((f) => [f.path, f]));
  const notes: string[] = [];

  let files = touchHint.filter((f) => nodes.has(f));
  const unknown = touchHint.filter((f) => !nodes.has(f));
  if (unknown.length > 0) notes.push(`not in the map (new files?): ${unknown.join(", ")}`);
  if (files.length === 0) {
    files = guessFilesFromTask(task, ctx.map);
    if (files.length > 0) notes.push(`no touchHint given — guessed candidate files from the task wording ⚠ inferred`);
  }

  const riskNotesFor = (paths: string[]): string[] =>
    [...new Set(paths.flatMap((p) => areas.filter((a) => pathInArea(p, a)).map((a) => `risk area: ${a.id} — ${a.reason}`)))];

  const pick = (roles: string[]): string[] => files.filter((f) => roles.includes(nodes.get(f)?.role.value ?? ""));
  const cheap = (["typecheck", "lint"] as const).map((k) => byKind.get(k)).filter((c): c is string => c !== undefined);
  const test = byKind.get("test");
  const testFile = byKind.get("test-file");
  const steps: PrStep[] = [];

  const modelFiles = pick(["data-model", "migration"]);
  if (modelFiles.length > 0 || /\b(schema|model|column|field|migration|table)\b/i.test(task)) {
    const migrate = byKind.get("migrate");
    steps.push({
      title: "Schema / data model",
      files: modelFiles,
      verify: [...(migrate ? [migrate] : []), ...(test ? [test] : [])],
      riskNotes: riskNotesFor(modelFiles),
    });
  }

  const logicFiles = pick(["core-logic"]);
  if (logicFiles.length > 0 || steps.length === 0) {
    const coveringTests = [...new Set(logicFiles.flatMap((f) => nodes.get(f)?.tests ?? []))];
    const scoped = testFile && coveringTests.length > 0 ? coveringTests.map((t) => testFile.replace("{file}", t)) : test ? [test] : [];
    steps.push({
      title: "Domain logic + unit tests",
      files: [...logicFiles, ...coveringTests],
      verify: [...cheap, ...scoped],
      riskNotes: riskNotesFor(logicFiles),
    });
  }

  const surfaceFiles = pick(["route", "ui-component", "entrypoint"]);
  if (surfaceFiles.length > 0 || /\b(endpoint|route|page|ui|screen|api)\b/i.test(task)) {
    const e2e = byKind.get("test-e2e");
    steps.push({
      title: "Integration (routes / UI)",
      files: surfaceFiles,
      verify: [...(test ? [test] : []), ...(e2e ? [e2e] : [])],
      riskNotes: riskNotesFor(surfaceFiles),
    });
  }

  for (const step of steps) step.verify.push("iknowkungfu risk --staged");

  return {
    task,
    steps,
    splitRequired: steps.length > 1 || files.length > ctx.config.diffLimits.warnFiles,
    planQuality: "template",
    notes,
  };
}

function guessFilesFromTask(task: string, map: ProjectMap): string[] {
  const words = [...new Set(task.toLowerCase().match(/[a-z]{4,}/g) ?? [])];
  if (words.length === 0) return [];
  const scored = map.files
    .filter((f) => ["core-logic", "data-model", "route", "ui-component"].includes(f.role.value))
    .map((f) => ({ path: f.path, score: words.filter((w) => f.path.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.path.localeCompare(a.path));
  return scored.slice(0, 8).map((x) => x.path);
}
