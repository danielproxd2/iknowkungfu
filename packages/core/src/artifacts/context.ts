import type { HarnessConfig, ProjectMap, RepoManifest, RiskArea } from "@repo-harness/schemas";

export interface DocContext {
  /** Project display name (root dir basename or package name). */
  name: string;
  manifest: RepoManifest;
  map: ProjectMap;
  config: HarnessConfig;
}

/** Glob-lite match: supports trailing "/**" and exact prefixes — enough for risk-area paths. */
export function pathInArea(path: string, area: RiskArea): boolean {
  return area.paths.some((glob) => {
    const clean = glob.replace(/\/\*\*$/, "").replace(/\/\*$/, "").replace(/\/$/, "");
    return path === clean || path.startsWith(`${clean}/`);
  });
}

export function areasFor(path: string, config: HarnessConfig): RiskArea[] {
  return config.riskAreas.filter((a) => pathInArea(path, a));
}

export function warnMark(provenance: string): string {
  if (provenance === "inferred") return " ⚠ inferred";
  if (provenance === "llm") return " 🤖 llm";
  return "";
}

export function topDependents(map: ProjectMap, n: number): Array<{ path: string; dependents: number }> {
  return map.files
    .filter((f) => f.dependents > 0)
    .sort((a, b) => b.dependents - a.dependents || a.path.localeCompare(b.path))
    .slice(0, n)
    .map((f) => ({ path: f.path, dependents: f.dependents }));
}
