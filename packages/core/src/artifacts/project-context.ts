import { effectiveRiskAreas } from "../risk/areas";
import { areasTouchingDir, topDependents, warnMark, type DocContext } from "./context";
import { blockHash, type ArtifactBlock, type GeneratedArtifact } from "./blocks";

const BUDGET = 150;

function identityBlock(ctx: DocContext): ArtifactBlock {
  const { stack, stats } = ctx.manifest;
  const fw = stack.frameworks.filter((f) => !f.value.startsWith("typescript@")).slice(0, 4).map((f) => f.value);
  const lang = stack.languages[0];
  const line1 = fw.length > 0 ? fw.join(" · ") : "no framework detected";
  const parts2 = [
    stack.monorepo ? `Monorepo: ${stack.monorepo.value.tool} (${stack.monorepo.value.packages.join(", ")})` : "Monorepo: no",
    `${stats.files} files`,
    lang ? `main language ${lang.value.name} (${lang.value.percent}%)` : "",
    stack.packageManager?.value ?? "",
    stack.runtime?.value ?? "",
  ].filter(Boolean);
  const content = `# Project Context: ${ctx.name}\n\n${line1}\n${parts2.join(" · ")}`;
  return { id: "identity", inputs: blockHash({ name: ctx.name, stack, files: stats.files }), content };
}

function commandsBlock(ctx: DocContext): ArtifactBlock {
  const rows = ctx.manifest.commands.commands.map((c) => {
    const notes = [c.notes, c.provenance === "detected" ? "" : warnMark(c.provenance).trim() || c.provenance]
      .filter(Boolean)
      .join(" · ");
    return `| ${c.kind} | \`${c.command}\` | ${notes} |`;
  });
  const content = [
    "## Commands (exact — do not improvise)",
    "| Task | Command | Notes |",
    "|------|---------|-------|",
    ...rows,
    "",
    "`{file}` = a specific file path. Commands not in this table must not be guessed.",
  ].join("\n");
  return { id: "commands", inputs: blockHash(ctx.manifest.commands), content };
}

function layoutBlock(ctx: DocContext): ArtifactBlock {
  const areas = effectiveRiskAreas(ctx.config, ctx.map);
  const topDirs = ctx.map.directories.filter((d) => !d.path.includes("/")).slice(0, 12);
  const lines = topDirs.map((d) => {
    const marks = areasTouchingDir(d.path, areas)
      .map((a) => ` ⚠ RISK AREA (${a.id}) — see REFACTOR_GUARDRAILS.md`)
      .join("");
    return `- \`${d.path}/\` — ${d.role.value}${marks}`;
  });
  const heavy = topDependents(ctx.map, 3).map((f) => `\`${f.path}\` (${f.dependents} dependents)`);
  const content = [
    "## Layout",
    ...lines,
    ...(heavy.length > 0 ? ["", `Heaviest imports: ${heavy.join(" · ")}`] : []),
  ].join("\n");
  return {
    id: "layout",
    inputs: blockHash({ dirs: topDirs, heavy, risk: areas.map((a) => a.id) }),
    content,
  };
}

function entrypointsBlock(ctx: DocContext): ArtifactBlock {
  const eps = ctx.map.entrypoints.slice(0, 8);
  const lines = eps.map((e) => `- ${e.value.kind}: \`${e.value.path}\` — \`${e.value.how}\`${warnMark(e.provenance)}`);
  const env = ctx.manifest.env;
  const envLine = env.exampleFile ? `Env vars (${env.variables.length}): see \`${env.exampleFile}\`` : "";
  const content = ["## Entry points", ...(lines.length > 0 ? lines : ["- none detected"]), ...(envLine ? ["", envLine] : [])].join("\n");
  return { id: "entrypoints", inputs: blockHash({ eps, env }), content };
}

function conventionsBlock(ctx: DocContext): ArtifactBlock {
  const tests = ctx.map.files.filter((f) => f.role.value === "test").map((f) => f.path);
  const conventions: string[] = [];
  if (tests.some((t) => t.startsWith("tests/") || t.startsWith("test/"))) {
    conventions.push("Tests live under `tests/`, mirroring source paths");
  }
  if (tests.some((t) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(t) && !t.startsWith("tests/") && !t.startsWith("e2e/"))) {
    conventions.push("Some tests are colocated next to their source files");
  }
  if (tests.some((t) => t.startsWith("e2e/"))) conventions.push("End-to-end specs live under `e2e/`");
  if (conventions.length === 0) conventions.push("No test-location convention detected");
  const content = ["## Conventions ⚠ inferred", ...conventions.map((c) => `- ${c}`)].join("\n");
  return { id: "conventions", inputs: blockHash(conventions), content };
}

export function projectContextArtifact(ctx: DocContext): GeneratedArtifact {
  const blocks = [identityBlock(ctx), commandsBlock(ctx), layoutBlock(ctx), entrypointsBlock(ctx), conventionsBlock(ctx)];
  const warnings: string[] = [];
  const lines = blocks.reduce((n, b) => n + b.content.split("\n").length + 3, 1);
  if (lines > BUDGET) warnings.push(`PROJECT_CONTEXT.md over budget: ~${lines} lines (budget ${BUDGET})`);
  return {
    id: "project-context",
    path: ".repo-harness/docs/PROJECT_CONTEXT.md",
    blocks,
    ownership: "managed-file",
    lineBudget: BUDGET,
    warnings,
  };
}
