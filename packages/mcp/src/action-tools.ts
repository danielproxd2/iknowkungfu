import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { changedFiles, parseDiff, planSmallPr, planVerify, riskCheck, runVerify } from "@repo-harness/core";
import { err, ok } from "./payload";
import { invalidateStaleCache } from "./state";
import { withState } from "./read-tools";

const pexec = promisify(execFile);

export interface ActionToolOptions {
  readonly?: boolean;
  /** Path to the repo-harness CLI entry (refresh_context shells out to keep the single write choke point). */
  cliPath?: string;
}

export function registerActionTools(server: McpServer, root: string, opts: ActionToolOptions = {}): void {
  server.registerTool(
    "verify_change",
    {
      description:
        "Run the repo's own checks (typecheck/lint/scoped tests) and return structured pass/fail. THE loop-closer: use after every logical change instead of claiming 'should work'.",
      inputSchema: {
        scope: z.enum(["changed", "full", "baseline"]).optional().describe("default: changed"),
        files: z.array(z.string()).optional().describe("explicit changed files (skips git detection)"),
        timeoutSec: z.number().int().positive().max(3600).optional().describe("per-command timeout, default 600"),
      },
    },
    withState(root, async ({ scope, files, timeoutSec }: { scope?: "changed" | "full" | "baseline"; files?: string[]; timeoutSec?: number }, state) => {
      const effectiveScope = scope ?? "changed";
      const changed = effectiveScope !== "changed" ? [] : files && files.length > 0 ? files : await changedFiles(root);
      const plan = planVerify(effectiveScope, changed, state.manifest, state.map);
      const result = await runVerify(root, plan, { timeoutMs: (timeoutSec ?? 600) * 1000 });
      return ok({ ...result, notes: plan.notes }, state);
    }),
  );

  server.registerTool(
    "risk_check_diff",
    {
      description:
        "Deterministic pre-commit risk gate: risk areas, deleted tests, oversized diffs, debug statements. Run before finishing; address every blocker.",
      inputSchema: { range: z.string().optional().describe("git range (e.g. main..HEAD); default: staged diff") },
    },
    withState(root, async ({ range }: { range?: string }, state) => {
      const files = await parseDiff(root, range ?? null);
      const report = riskCheck(files, range ?? "staged", { map: state.map, config: state.config });
      return ok({ ...report }, state);
    }),
  );

  server.registerTool(
    "plan_small_pr",
    {
      description:
        "Decompose a task into small, independently-verifiable steps with exact verify commands and risk notes. Use when a change would exceed ~5 files.",
      inputSchema: {
        task: z.string().describe("what you are trying to accomplish"),
        touchHint: z.array(z.string()).optional().describe("files you expect to touch"),
      },
    },
    withState(root, ({ task, touchHint }: { task: string; touchHint?: string[] }, state) =>
      ok({ ...planSmallPr(task, touchHint ?? [], state) }, state),
    ),
  );

  if (!opts.readonly) {
    server.registerTool(
      "refresh_context",
      {
        description: "Re-scan the repo and rewrite stale harness docs/adapters. Call when any tool reports stale:true.",
        inputSchema: { force: z.boolean().optional().describe("rewrite all blocks, not just stale ones") },
      },
      async ({ force }: { force?: boolean }) => {
        const cliPath = opts.cliPath ?? process.argv[1];
        if (!cliPath) return err({ code: "env", message: "CLI path unknown; cannot refresh.", fix: "Run `repo-harness refresh` in a terminal." });
        try {
          const { stdout } = await pexec(
            process.execPath,
            [cliPath, "refresh", ...(force ? ["--force"] : []), "--json", "--cwd", root],
            { maxBuffer: 8 * 1024 * 1024 },
          );
          invalidateStaleCache();
          return { content: [{ type: "text" as const, text: stdout.trim() }] };
        } catch (e) {
          const detail = (e as { stderr?: string; message?: string }).stderr || (e as Error).message;
          return err({ code: "env", message: `refresh failed: ${detail.split("\n")[0]}`, fix: "Run `repo-harness refresh` in a terminal to see full output." });
        }
      },
    );
  }
}
