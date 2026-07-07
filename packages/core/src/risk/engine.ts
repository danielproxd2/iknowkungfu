import {
  SCHEMA_VERSION,
  type HarnessConfig,
  type ProjectMap,
  type RiskArea,
  type RiskFinding,
  type RiskReport,
} from "@repo-harness/schemas";
import { pathInArea } from "../artifacts/context";
import type { ParsedDiffFile } from "../git";
import { effectiveRiskAreas } from "./areas";

export interface RiskContext {
  map: ProjectMap;
  config: HarnessConfig;
}

interface RuleInput extends RiskContext {
  files: ParsedDiffFile[];
  areas: RiskArea[];
  contentRulesActive: boolean;
}

type Rule = (input: RuleInput) => RiskFinding[];

const HUGE_DIFF_LINES = 5000;

function isTestPath(path: string): boolean {
  return (
    /(^|\/)(tests?|__tests__|e2e)\//.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || /(^|\/)test_[^/]*\.py$/.test(path)
  );
}

const riskAreaRule: Rule = ({ files, areas }) => {
  const findings: RiskFinding[] = [];
  for (const file of files) {
    for (const area of areas.filter((a) => pathInArea(file.path, a))) {
      const neverEdit = area.rules.some((r) => r.kind === "never-edit") && file.status !== "added";
      const blocks = area.provenance === "user" && neverEdit;
      findings.push({
        severity: blocks ? "blocker" : "warning",
        rule: neverEdit ? "never-edit" : "risk-area",
        file: file.path,
        message: `Touches risk area '${area.id}' (${area.reason})${neverEdit ? " — marked never-edit" : ""}`,
        suggestion: neverEdit
          ? "Revert this file; create a new file instead of editing generated/append-only content."
          : `Confirm the area rule was followed and flag '${area.id}' explicitly in your report.`,
      });
    }
  }
  return findings;
};

const testIntegrityRule: Rule = ({ files, contentRulesActive }) => {
  const findings: RiskFinding[] = [];
  for (const file of files) {
    if (!isTestPath(file.path)) continue;
    if (file.status === "deleted") {
      findings.push({
        severity: "blocker",
        rule: "test-deleted",
        file: file.path,
        message: "Test file deleted",
        suggestion: "Restore it and fix the source instead — or justify the deletion explicitly in your report.",
      });
    } else if (contentRulesActive && file.addedLines.some((l) => /\.(skip|only)\(|\bxit\(|\bxdescribe\(|pytest\.mark\.skip/.test(l))) {
      findings.push({
        severity: "warning",
        rule: "test-skipped",
        file: file.path,
        message: "Added .skip/.only/skip-mark to a test",
        suggestion: "Remove the skip before finishing; a skipped test is a deleted test with better manners.",
      });
    }
  }
  return findings;
};

const diffSizeRule: Rule = ({ files, config }) => {
  const insertions = files.reduce((n, f) => n + f.insertions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);
  const lines = insertions + deletions;
  const l = config.diffLimits;
  if (files.length > l.blockFiles || lines > l.blockLines) {
    return [
      {
        severity: "blocker",
        rule: "diff-size",
        message: `Diff too large: ${files.length} files, ${lines} lines (block at >${l.blockFiles} files or >${l.blockLines} lines)`,
        suggestion: "Split into smaller PRs (MCP plan_small_pr) unless the task explicitly asked for a large refactor.",
      },
    ];
  }
  if (files.length > l.warnFiles || lines > l.warnLines) {
    return [
      {
        severity: "warning",
        rule: "diff-size",
        message: `Large diff: ${files.length} files, ${lines} lines (warn at >${l.warnFiles} files or >${l.warnLines} lines)`,
        suggestion: "Consider splitting; reviewers lose accuracy past ~200 changed lines.",
      },
    ];
  }
  return [];
};

const lockfileRule: Rule = ({ files }) => {
  const LOCK_TO_MANIFEST: Record<string, string[]> = {
    "pnpm-lock.yaml": ["package.json"],
    "package-lock.json": ["package.json"],
    "yarn.lock": ["package.json"],
    "bun.lock": ["package.json"],
    "poetry.lock": ["pyproject.toml"],
    "uv.lock": ["pyproject.toml"],
  };
  const changed = new Set(files.map((f) => f.path));
  const findings: RiskFinding[] = [];
  for (const [lock, manifests] of Object.entries(LOCK_TO_MANIFEST)) {
    if (changed.has(lock) && !manifests.some((m) => changed.has(m))) {
      findings.push({
        severity: "warning",
        rule: "lockfile-churn",
        file: lock,
        message: `${lock} changed without ${manifests[0]}`,
        suggestion: "Regenerate the lockfile from a clean state — incidental lockfile churn hides supply-chain drift.",
      });
    }
  }
  return findings;
};

const generatedPathRule: Rule = ({ files, map }) => {
  const roles = new Map(map.files.map((f) => [f.path, f.role.value]));
  const findings: RiskFinding[] = [];
  for (const file of files) {
    const role = roles.get(file.path);
    if ((role === "migration" || role === "generated") && file.status !== "added") {
      findings.push({
        severity: "warning",
        rule: "generated-edited",
        file: file.path,
        message: `Edited a ${role} file (these are append-only/generated ⚠ inferred)`,
        suggestion: "Create a new migration / regenerate instead of editing history.",
      });
    }
  }
  return findings;
};

const debugStatementRule: Rule = ({ files, contentRulesActive }) => {
  if (!contentRulesActive) return [];
  const findings: RiskFinding[] = [];
  for (const file of files) {
    if (isTestPath(file.path)) continue;
    const isJs = /\.[cm]?[jt]sx?$/.test(file.path);
    const isPy = file.path.endsWith(".py");
    if (!isJs && !isPy) continue;
    if (file.addedLines.some((l) => (isJs && /\bconsole\.log\(|\bdebugger\b/.test(l)) || (isPy && /^\s*print\(/.test(l)))) {
      findings.push({
        severity: "warning",
        rule: "debug-statement",
        file: file.path,
        message: "Added a debug statement (console.log/debugger/print)",
        suggestion: "Remove it or replace it with the project's logger.",
      });
    }
    if (file.addedLines.some((l) => /\b(TODO|FIXME)\b/.test(l))) {
      findings.push({
        severity: "info",
        rule: "todo-added",
        file: file.path,
        message: "Added a TODO/FIXME",
        suggestion: "Mention it in your report so it doesn't silently rot.",
      });
    }
  }
  return findings;
};

const renameEditRule: Rule = ({ files }) => {
  return files
    .filter((f) => f.status === "renamed" && f.insertions + f.deletions > 10)
    .map((f) => ({
      severity: "warning" as const,
      rule: "rename-plus-edit",
      file: f.path,
      message: `Renamed AND edited (${f.insertions + f.deletions} lines) in one change`,
      suggestion: "Split: rename in one commit, edit in the next — otherwise the diff is unreviewable.",
    }));
};

const RULES: Rule[] = [riskAreaRule, testIntegrityRule, diffSizeRule, lockfileRule, generatedPathRule, debugStatementRule, renameEditRule];
const SEVERITY_ORDER = { blocker: 0, warning: 1, info: 2 } as const;

export function riskCheck(files: ParsedDiffFile[], range: string, ctx: RiskContext): RiskReport {
  const totalLines = files.reduce((n, f) => n + f.insertions + f.deletions, 0);
  const contentRulesActive = totalLines <= HUGE_DIFF_LINES;
  const input: RuleInput = { ...ctx, files, areas: effectiveRiskAreas(ctx.config, ctx.map), contentRulesActive };

  const findings = RULES.flatMap((rule) => rule(input));
  if (!contentRulesActive) {
    findings.push({
      severity: "info",
      rule: "partial-analysis",
      message: `Diff exceeds ${HUGE_DIFF_LINES} lines — content rules skipped, path/size rules still applied`,
      suggestion: "Split the change; a diff this size cannot be meaningfully reviewed.",
    });
  }
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    schemaVersion: SCHEMA_VERSION,
    range,
    summary: {
      files: files.length,
      insertions: files.reduce((n, f) => n + f.insertions, 0),
      deletions: files.reduce((n, f) => n + f.deletions, 0),
    },
    findings,
    verdict: findings.some((f) => f.severity === "blocker")
      ? "blocked"
      : findings.some((f) => f.severity === "warning")
        ? "warnings"
        : "clean",
  };
}
