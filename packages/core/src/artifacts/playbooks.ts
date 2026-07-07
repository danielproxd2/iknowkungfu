import { blockHash, type ArtifactBlock, type GeneratedArtifact } from "./blocks";
import type { DocContext } from "./context";

const BUDGET = 120;

function has(ctx: DocContext, framework: string): boolean {
  return ctx.manifest.stack.frameworks.some((f) => f.value === framework || f.value.startsWith(`${framework}@`));
}

export function playbooksArtifact(ctx: DocContext): GeneratedArtifact {
  const byKind = new Map(ctx.manifest.commands.commands.map((c) => [c.kind, c.command]));
  const blocks: ArtifactBlock[] = [{ id: "title", inputs: blockHash("title-v1"), content: "# Debugging Playbooks" }];
  const push = (id: string, lines: string[]) => blocks.push({ id, inputs: blockHash(lines), content: lines.join("\n") });

  const testFile = byKind.get("test-file");
  const test = byKind.get("test");
  if (test) {
    const single = testFile ? testFile.replace("{file}", "<file>") : test;
    const nameFilter = has(ctx, "pytest") ? `${single} -k "<name>"` : `${single} -t "<name>"`;
    push("pb-test-failure", [
      "## A test fails",
      `1. Re-run only it: \`${nameFilter}\`. Confirm it is reproducible before touching anything.`,
      "2. Read the assertion diff before reading any source code.",
      "3. `git log --oneline -5 -- <source-file>` — was the code under test recently changed?",
      "4. Fix the source, not the test — unless the task explicitly changed intended behavior.",
    ]);
  }

  const typecheck = byKind.get("typecheck");
  if (typecheck) {
    push("pb-type-error", [
      "## Typecheck fails after your edit",
      `1. \`${typecheck}\` — fix the FIRST error only, then re-run. Cascading errors lie.`,
      "2. Error in a file you didn't touch → your change altered an inferred/exported type. Inspect your file's exports first.",
    ]);
  }

  const cacheSteps: string[] = [];
  if (has(ctx, "nextjs")) cacheSteps.push("Next.js caches aggressively: stop the dev server and delete `.next/` before re-testing.");
  if (has(ctx, "vite")) cacheSteps.push("Vite: restart the dev server with `--force` to bust the prebundle cache.");
  if (ctx.manifest.stack.languages.some((l) => l.value.name === "Python"))
    cacheSteps.push("Python: delete `__pycache__/` and re-run; stale bytecode masks edits after renames.");
  const dev = byKind.get("dev");
  if (cacheSteps.length > 0) {
    push("pb-stale-behavior", [
      "## Change compiles but behavior doesn't update",
      ...cacheSteps.map((s, i) => `${i + 1}. ${s}`),
      ...(dev ? [`${cacheSteps.length + 1}. Then restart: \`${dev}\`.`] : []),
    ]);
  }

  if (ctx.manifest.env.exampleFile) {
    push("pb-env", [
      "## Startup fails with missing configuration",
      `1. Compare your environment against \`${ctx.manifest.env.exampleFile}\` (${ctx.manifest.env.variables.length} variables expected).`,
      "2. Never invent values for secrets — report which variable is missing and stop.",
    ]);
  }

  push("pb-general", [
    "## Any other failure",
    "1. Reproduce with the narrowest command from PROJECT_CONTEXT.md § Commands.",
    "2. Read the LAST error first (root cause), then the first (entry point).",
    "3. Two failed fix attempts → stop, write down what you know, re-read AGENT_RUNBOOK.md § When stuck.",
  ]);

  return {
    id: "debugging-playbooks",
    path: ".repo-harness/docs/DEBUGGING_PLAYBOOKS.md",
    blocks,
    ownership: "managed-file",
    lineBudget: BUDGET,
    warnings: [],
  };
}
