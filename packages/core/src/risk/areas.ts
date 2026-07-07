import type { HarnessConfig, ProjectMap, RiskArea } from "@repo-harness/schemas";

/** Directory-name patterns that usually indicate blast-radius-sensitive code. */
const NAME_PATTERNS: Array<{ id: string; re: RegExp; reason: string }> = [
  { id: "auth", re: /(^|\/)(auth|authn|authz|login|sessions?)($|\/)/, reason: "authentication (name heuristic)" },
  { id: "payments", re: /(^|\/)(payments?|billing|checkout|stripe)($|\/)/, reason: "money movement (name heuristic)" },
  { id: "crypto", re: /(^|\/)(crypto|secrets?|keys)($|\/)/, reason: "cryptography/secrets (name heuristic)" },
  { id: "migrations", re: /(^|\/)migrations?($|\/)/, reason: "schema migrations (name heuristic)" },
];

/** Inferred areas warn but never block; user-declared areas always win their id. */
export function inferRiskAreas(map: ProjectMap): RiskArea[] {
  const found = new Map<string, Set<string>>();
  for (const file of map.files) {
    const slash = file.path.lastIndexOf("/");
    if (slash < 0) continue;
    const dir = file.path.slice(0, slash);
    for (const { id, re } of NAME_PATTERNS) {
      const m = dir.match(re);
      if (!m || m.index === undefined) continue;
      const area = dir.slice(0, m.index + m[0].length).replace(/\/$/, "");
      const paths = found.get(id) ?? new Set<string>();
      paths.add(`${area}/**`);
      found.set(id, paths);
    }
  }
  const out: RiskArea[] = [];
  for (const { id, reason } of NAME_PATTERNS) {
    const paths = found.get(id);
    if (!paths) continue;
    out.push({
      id,
      paths: [...paths].sort(),
      reason,
      provenance: "inferred",
      rules: [{ kind: "flag-in-report" }, ...(id === "migrations" ? ([{ kind: "never-edit" }] as const) : [])],
    });
  }
  return out;
}

export function effectiveRiskAreas(config: HarnessConfig, map: ProjectMap): RiskArea[] {
  const userIds = new Set(config.riskAreas.map((a) => a.id));
  return [...config.riskAreas, ...inferRiskAreas(map).filter((a) => !userIds.has(a.id))];
}
