import type { CommandKind } from "@iknowkungfu/schemas";
import { blockHash, type ArtifactBlock, type GeneratedArtifact } from "./blocks";
import type { DocContext } from "./context";

const BUDGET = 120;

function cheapChecks(ctx: DocContext): string[] {
  const byKind = new Map(ctx.manifest.commands.commands.map((c) => [c.kind, c.command]));
  const kinds: CommandKind[] = ["typecheck", "lint"];
  return kinds.map((k) => byKind.get(k)).filter((c): c is string => c !== undefined);
}

export function neverEditPaths(ctx: DocContext): string[] {
  const paths = new Set<string>([".iknowkungfu/ (generated)"]);
  for (const area of ctx.config.riskAreas) {
    if (area.rules.some((r) => r.kind === "never-edit")) for (const p of area.paths) paths.add(`${p} (${area.reason})`);
  }
  for (const dir of ctx.map.directories) {
    if (dir.role.value === "migration") paths.add(`${dir.path}/ (append-only migrations)`);
    if (dir.role.value === "generated") paths.add(`${dir.path}/ (generated)`);
  }
  return [...paths].sort();
}

function loopBlock(ctx: DocContext): ArtifactBlock {
  const cheap = cheapChecks(ctx);
  const limits = ctx.config.diffLimits;
  const content = [
    "## The loop (follow literally)",
    "1. Read PROJECT_CONTEXT.md first. Do not explore the tree for facts it already states.",
    "2. Before editing, confirm the repo is green: `iknowkungfu verify --baseline` (or MCP `verify_change` with scope `baseline`). If red, report — do not fix unrelated breakage.",
    `3. Plan the smallest diff that satisfies the task. More than ${limits.warnFiles} files or ${limits.warnLines} changed lines → split the work (MCP \`plan_small_pr\`).`,
    `4. Edit. After each logical change run \`iknowkungfu verify --changed\`${cheap.length > 0 ? ` (runs ${cheap.map((c) => `\`${c}\``).join(", ")} + scoped tests)` : ""}.`,
    "5. Before finishing: `iknowkungfu risk --staged`. Address every `blocker`; mention every `warning` in your report.",
    "6. Report: what changed, what you ran, what passed. Claim only what you executed.",
  ].join("\n");
  return { id: "loop", inputs: blockHash({ cheap, limits }), content };
}

function rulesBlock(ctx: DocContext): ArtifactBlock {
  const never = neverEditPaths(ctx);
  const content = [
    "## Hard rules",
    ...never.map((p) => `- Never edit: \`${p.split(" ")[0]}\` — ${p.slice(p.indexOf("(") + 1, -1)}`),
    "- Never delete or skip a test to make verification pass.",
    "- A command not listed in PROJECT_CONTEXT.md § Commands is a command you must not guess.",
    "- Facts tagged `⚠ inferred` or `🤖 llm` need verification before you rely on them; untagged facts are parsed from config — trust them.",
  ].join("\n");
  return { id: "rules", inputs: blockHash(never), content };
}

function recoveryBlock(): ArtifactBlock {
  const content = [
    "## When stuck",
    "- A test fails and you don't know why → DEBUGGING_PLAYBOOKS.md",
    "- The change feels too big → MCP `plan_small_pr`",
    "- Unsure whether a file is safe to touch → MCP `explain_file` (role + dependents + risk)",
    "- Harness facts look wrong or stale → `iknowkungfu refresh` (or MCP `refresh_context`)",
  ].join("\n");
  return { id: "recovery", inputs: blockHash("recovery-v1"), content };
}

export function runbookArtifact(ctx: DocContext): GeneratedArtifact {
  const blocks = [
    { id: "title", inputs: blockHash("title-v1"), content: "# Agent Runbook" },
    loopBlock(ctx),
    rulesBlock(ctx),
    recoveryBlock(),
  ];
  return {
    id: "agent-runbook",
    path: ".iknowkungfu/docs/AGENT_RUNBOOK.md",
    blocks,
    ownership: "managed-file",
    lineBudget: BUDGET,
    warnings: [],
  };
}
