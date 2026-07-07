import type { ProjectMap, RepoManifest } from "@repo-harness/schemas";

export type VerifyScope = "changed" | "full" | "baseline";

export interface VerifyPlan {
  scope: VerifyScope;
  changedFiles: string[];
  commands: string[];
  uncovered: string[];
  notes: string[];
}

const CODE_ROLES = new Set(["core-logic", "data-model", "route", "ui-component", "entrypoint"]);
const MAX_SCOPED_TESTS = 10;

export function planVerify(
  scope: VerifyScope,
  changed: string[],
  manifest: RepoManifest,
  map: ProjectMap,
): VerifyPlan {
  const byKind = new Map(manifest.commands.commands.map((c) => [c.kind, c.command]));
  const commands: string[] = [];
  const notes: string[] = [];
  const cheap = manifest.commands.verifyOrder
    .filter((k) => k !== "test" && k !== "test-file")
    .map((k) => byKind.get(k))
    .filter((c): c is string => c !== undefined);

  if (scope !== "changed") {
    const full = byKind.get("test");
    return {
      scope,
      changedFiles: [],
      commands: [...cheap, ...(full ? [full] : [])],
      uncovered: [],
      notes: full ? [] : ["no test command in the catalog"],
    };
  }

  commands.push(...cheap);
  const nodes = new Map(map.files.map((f) => [f.path, f]));
  const coveringTests = new Set<string>();
  const uncovered: string[] = [];
  let needFull = changed.length === 0 ? false : undefined;

  for (const file of changed) {
    const node = nodes.get(file);
    if (!node) {
      // Unknown to the map (new file, or a tracked input like package.json) → be conservative.
      if (/\.(json|yaml|yml|toml|lock)$/.test(file)) needFull = true;
      continue;
    }
    if (node.role.value === "test") {
      coveringTests.add(node.path);
      continue;
    }
    if (!CODE_ROLES.has(node.role.value)) continue;
    if (node.role.value === "data-model") needFull = true;
    if (node.tests.length === 0) uncovered.push(file);
    for (const t of node.tests) coveringTests.add(t);
  }

  const testFile = byKind.get("test-file");
  const full = byKind.get("test");
  if (changed.length === 0) {
    notes.push("no changes detected — running cheap checks only");
  } else if (testFile && coveringTests.size > 0 && coveringTests.size <= MAX_SCOPED_TESTS) {
    for (const t of [...coveringTests].sort()) commands.push(testFile.replace("{file}", t));
    if (needFull || uncovered.length > 0) needFull = true;
  } else {
    needFull = true;
    if (coveringTests.size > MAX_SCOPED_TESTS) notes.push(`${coveringTests.size} covering tests — running the full suite instead`);
  }
  if (needFull && full) commands.push(full);
  else if (needFull && !full) notes.push("full suite needed but no test command in the catalog");

  return { scope, changedFiles: changed, commands: dedupe(commands), uncovered: uncovered.sort(), notes };
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
