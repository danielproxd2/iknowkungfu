import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  changedFiles,
  effectiveRiskAreas,
  loadConfig,
  nameMatchesSource,
  planVerify,
  promptDefs,
} from "@iknowkungfu/core";
import { parseConfig, type RiskArea } from "@iknowkungfu/schemas";
import { capList, err, ok, type ToolResult } from "./payload";
import { isStateError, loadState, type HarnessState } from "./state";

const pexec = promisify(execFile);
const MAX_NODES = 200;

type Handler<A> = (args: A, state: HarnessState) => Promise<ToolResult> | ToolResult;

export function withState<A>(root: string, handler: Handler<A>): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    const state = await loadState(root);
    if (isStateError(state)) return err(state);
    try {
      return await handler(args, state);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const fix = (e as { fix?: string }).fix ?? "Check the arguments and try a narrower query.";
      return err({ code: "env", message, fix });
    }
  };
}

function areaFor(path: string, areas: RiskArea[]): string | undefined {
  return areas.find((a) =>
    a.paths.some((glob) => {
      const clean = glob.replace(/\/\*\*$/, "").replace(/\/\*$/, "");
      return path === clean || path.startsWith(`${clean}/`);
    }),
  )?.id;
}

export function registerReadTools(server: McpServer, root: string): void {
  server.registerTool(
    "repo_map",
    {
      description:
        "Structural map of the repo (precomputed): directories, file roles, dependents, risk areas. Use this INSTEAD of exploring the tree.",
      inputSchema: {
        dir: z.string().optional().describe("Limit to this directory (posix-relative)"),
        depth: z.number().int().min(1).max(6).optional().describe("Path depth relative to dir (default 2)"),
      },
    },
    withState(root, ({ dir, depth }: { dir?: string; depth?: number }, state) => {
      const prefix = dir ? `${dir.replace(/\/$/, "")}/` : "";
      const maxDepth = (depth ?? 2) + (prefix === "" ? 0 : prefix.split("/").length - 1);
      const areas = effectiveRiskAreas(state.config, state.map);
      const dirs = state.map.directories
        .filter((d) => d.path.startsWith(prefix) || `${d.path}/` === prefix)
        .filter((d) => d.path.split("/").length <= maxDepth)
        .map((d) => ({ path: `${d.path}/`, role: d.role.value, risk: areaFor(d.path, areas) }));
      const files = state.map.files
        .filter((f) => f.path.startsWith(prefix) && f.path.split("/").length <= maxDepth)
        .map((f) => ({ path: f.path, role: f.role.value, dependents: f.dependents, risk: areaFor(f.path, areas) }));
      const nodes = capList([...dirs, ...files], MAX_NODES);
      return ok(
        {
          stack: state.manifest.stack.frameworks.map((f) => f.value),
          nodes: nodes.items,
          truncated: nodes.truncated,
          totalNodes: nodes.total,
          ...(nodes.truncated ? { hint: "pass `dir` to narrow" } : {}),
        },
        state,
      );
    }),
  );

  server.registerTool(
    "explain_file",
    {
      description: "Everything knowable about one file before touching it: role, exports, dependents, covering tests, risk.",
      inputSchema: { path: z.string().describe("posix-relative file path") },
    },
    withState(root, async ({ path: file }: { path: string }, state) => {
      const node = state.map.files.find((f) => f.path === file);
      if (!node) return err({ code: "usage", message: `Not in the map: ${file}`, fix: "Check the path via repo_map; run refresh_context if the file is new." });
      const areas = effectiveRiskAreas(state.config, state.map);
      const dependents = state.map.files.filter((f) => f.imports.includes(file)).map((f) => f.path);
      const capped = capList(dependents, 20);
      return ok(
        {
          path: file,
          role: node.role,
          exports: await extractExports(root, file),
          imports: node.imports,
          dependents: capped.items,
          dependentsTotal: capped.total,
          tests: node.tests,
          risk: areaFor(file, areas) ?? null,
          sizeLines: node.lines,
          lastChanged: await lastChanged(root, file),
        },
        state,
      );
    }),
  );

  server.registerTool(
    "find_entrypoints",
    {
      description: "Where execution starts: web roots, API routes, CLIs, runnable scripts — with the exact command to run each.",
      inputSchema: { kind: z.enum(["web", "api", "cli", "worker", "script", "all"]).optional() },
    },
    withState(root, ({ kind }: { kind?: string }, state) => {
      const eps = state.map.entrypoints
        .filter((e) => !kind || kind === "all" || e.value.kind === kind)
        .map((e) => ({ ...e.value, provenance: e.provenance }));
      return ok({ entrypoints: eps }, state);
    }),
  );

  server.registerTool(
    "find_tests_for_change",
    {
      description:
        "Map changed files to the tests and EXACT commands that must pass. Defaults to the current uncommitted changes.",
      inputSchema: { files: z.array(z.string()).optional().describe("Changed files; default: git status") },
    },
    withState(root, async ({ files }: { files?: string[] }, state) => {
      const changed = files && files.length > 0 ? files : await changedFiles(root);
      const nodes = new Map(state.map.files.map((f) => [f.path, f]));
      const tests: Array<{ path: string; reason: string; for: string }> = [];
      for (const file of changed) {
        const node = nodes.get(file);
        if (!node || node.role.value === "test") continue;
        for (const t of node.tests) {
          const testNode = nodes.get(t);
          const reason = testNode?.imports.includes(file) ? "imports-target" : nameMatchesSource(t, file) ? "naming-convention" : "map";
          tests.push({ path: t, reason, for: file });
        }
      }
      const plan = planVerify("changed", changed, state.manifest, state.map);
      return ok({ changed, tests, commands: plan.commands, uncovered: plan.uncovered, notes: plan.notes }, state);
    }),
  );

  server.registerTool(
    "get_commands",
    {
      description: "The exact command catalog (build/test/lint/etc). Never guess a command — read it from here.",
      inputSchema: {},
    },
    withState(root, (_args: Record<string, never>, state) => ok({ ...state.manifest.commands }, state)),
  );

  registerPrompts(server, root);
}

async function extractExports(root: string, file: string): Promise<string[]> {
  try {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const content = readFileSync(path.join(root, ...file.split("/")), "utf8");
    const out = new Set<string>();
    if (/\.[cm]?[jt]sx?$/.test(file)) {
      for (const m of content.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+(\w+)/g)) out.add(m[1]!);
      for (const m of content.matchAll(/export\s*\{([^}]+)\}/g))
        for (const name of m[1]!.split(",")) {
          const clean = name.trim().split(/\s+as\s+/).pop();
          if (clean) out.add(clean);
        }
    } else if (file.endsWith(".py")) {
      for (const m of content.matchAll(/^(?:def|class)\s+(\w+)/gm)) if (!m[1]!.startsWith("_")) out.add(m[1]!);
    }
    return [...out].slice(0, 30);
  } catch {
    return [];
  }
}

async function lastChanged(root: string, file: string): Promise<string | null> {
  try {
    const { stdout } = await pexec("git", ["-C", root, "log", "-1", "--format=%cs", "--", file]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function registerPrompts(server: McpServer, root: string): void {
  // Prompt list mirrors PROMPTS.md via the shared promptDefs — single source of truth.
  let config;
  try {
    config = loadConfig(root).config;
  } catch {
    config = parseConfig({});
  }
  const defs = promptDefs(config);
  for (const def of defs) {
    server.registerPrompt(
      def.name,
      {
        description: def.description,
        argsSchema: { description: z.string().describe("The task description") },
      },
      ({ description }: { description: string }) => ({
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: def.template.replace("{DESCRIPTION}", description) },
          },
        ],
      }),
    );
  }
}
