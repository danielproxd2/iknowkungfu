import { blockHash, type ArtifactBlock, type GeneratedArtifact } from "./blocks";
import type { DocContext } from "./context";

const BUDGET = 100;

export interface PromptDef {
  name: string;
  description: string;
  template: string;
}

/** Also consumed by the MCP server's prompt list — single source of truth. */
export function promptDefs(ctx: DocContext): PromptDef[] {
  const limits = ctx.config.diffLimits;
  return [
    {
      name: "fix-bug",
      description: "Fix a bug with a reproduce-first, smallest-diff workflow",
      template:
        "Fix: {DESCRIPTION}. Read .repo-harness/docs/PROJECT_CONTEXT.md first. Reproduce with a failing test " +
        "before changing source. Follow AGENT_RUNBOOK.md steps 2–6. Smallest possible diff; do not refactor " +
        "adjacent code. Finish with the output of `repo-harness verify --changed`.",
    },
    {
      name: "add-feature",
      description: "Implement a feature with an explicit plan and PR-split check",
      template:
        "Implement: {DESCRIPTION}. First output a plan: files to touch, tests to add, risk areas involved " +
        `(check REFACTOR_GUARDRAILS.md). If more than ${limits.warnFiles} files, propose a PR split and stop ` +
        "for approval. Then implement following AGENT_RUNBOOK.md, verifying after each logical change.",
    },
    {
      name: "review-diff",
      description: "Review the staged diff with harness evidence attached",
      template:
        "Review the staged diff. Run `repo-harness risk --staged` and `repo-harness verify --changed`; include " +
        "both outputs verbatim. Then check: does the behavior change match the task? do tests cover the new " +
        "paths? was any risk-area file touched without following its rule?",
    },
  ];
}

export function promptsArtifact(ctx: DocContext): GeneratedArtifact {
  const blocks: ArtifactBlock[] = [{ id: "title", inputs: blockHash("title-v1"), content: "# Prompts" }];
  for (const p of promptDefs(ctx)) {
    blocks.push({
      id: `prompt-${p.name}`,
      inputs: blockHash(p),
      content: [`## ${p.name}`, `_${p.description}_`, "", `> ${p.template}`].join("\n"),
    });
  }
  return {
    id: "prompts",
    path: ".repo-harness/docs/PROMPTS.md",
    blocks,
    ownership: "managed-file",
    lineBudget: BUDGET,
    warnings: [],
  };
}
