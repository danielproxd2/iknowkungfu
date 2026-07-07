import { effectiveRiskAreas } from "../risk/areas";
import { blockHash, type ArtifactBlock, type GeneratedArtifact } from "./blocks";
import { topDependents, warnMark, type DocContext } from "./context";

const BUDGET = 80;

function ruleText(rules: Array<{ kind: string; value?: number }>): string {
  const parts = rules.map((r) => {
    switch (r.kind) {
      case "never-edit":
        return "never edit existing files";
      case "tests-first":
        return "write/extend tests BEFORE changing source";
      case "max-files-per-change":
        return `≤${r.value} files per change`;
      default:
        return "flag in your report if touched";
    }
  });
  return parts.join("; ") || "flag in your report if touched";
}

export function guardrailsArtifact(ctx: DocContext): GeneratedArtifact {
  const areas = effectiveRiskAreas(ctx.config, ctx.map);
  const areaRows = areas.map(
    (a) => `| ${a.paths.map((p) => `\`${p}\``).join(", ")} | ${a.reason}${warnMark(a.provenance)} | ${ruleText(a.rules)} |`,
  );
  const areasBlock: ArtifactBlock = {
    id: "risk-areas",
    inputs: blockHash(areas),
    content: [
      "## Risk areas",
      ...(areaRows.length > 0
        ? ["| Paths | Why | Rule |", "|-------|-----|------|", ...areaRows]
        : ["None declared. Add them to `.iknowkungfu/config.json#riskAreas` — 30 seconds that pays for itself."]),
    ].join("\n"),
  };

  const heavy = topDependents(ctx.map, 5);
  const blastBlock: ArtifactBlock = {
    id: "blast-radius",
    inputs: blockHash(heavy),
    content: [
      "## Blast radius (top reverse-dependency counts)",
      heavy.length > 0 ? heavy.map((h) => `\`${h.path}\` (${h.dependents})`).join(" · ") : "no import edges found",
      "",
      "Touching these → run the FULL suite, not just scoped tests.",
    ].join("\n"),
  };

  const l = ctx.config.diffLimits;
  const limitsBlock: ArtifactBlock = {
    id: "limits",
    inputs: blockHash(l),
    content: [
      "## Diff limits (enforced by `iknowkungfu risk`)",
      `warning: >${l.warnFiles} files or >${l.warnLines} lines · blocker: >${l.blockFiles} files or >${l.blockLines} lines`,
      "Rename + edit in one commit = warning (unreviewable). Refactors of risk areas need their own PR.",
    ].join("\n"),
  };

  return {
    id: "refactor-guardrails",
    path: ".iknowkungfu/docs/REFACTOR_GUARDRAILS.md",
    blocks: [{ id: "title", inputs: blockHash("title-v1"), content: "# Refactor Guardrails" }, areasBlock, blastBlock, limitsBlock],
    ownership: "managed-file",
    lineBudget: BUDGET,
    warnings: [],
  };
}
