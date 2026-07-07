import type { CatalogCommand, CommandKind, Fact } from "@iknowkungfu/schemas";
import type { FileIndex } from "../fsindex";
import { EMPTY_DETECTION, framework, type StackDetection } from "./types";

const FRAMEWORK_DEPS: Record<string, string> = {
  next: "nextjs",
  vite: "vite",
  express: "express",
  fastify: "fastify",
  hono: "hono",
  react: "react",
  vitest: "vitest",
  jest: "jest",
  "@playwright/test": "playwright",
};

/** Ordered: earlier rows win when several scripts map to the same kind. */
const SCRIPT_KINDS: Array<[script: string, kind: CommandKind]> = [
  ["test", "test"],
  ["test:unit", "test"],
  ["test:e2e", "test-e2e"],
  ["e2e", "test-e2e"],
  ["dev", "dev"],
  ["start:dev", "dev"],
  ["serve", "dev"],
  ["build", "build"],
  ["compile", "build"],
  ["lint", "lint"],
  ["lint:fix", "lint-fix"],
  ["typecheck", "typecheck"],
  ["type-check", "typecheck"],
  ["check-types", "typecheck"],
  ["format", "format"],
  ["fmt", "format"],
  ["migrate", "migrate"],
  ["db:migrate", "migrate"],
  ["db:generate", "migrate"],
  ["db:push", "migrate"],
  ["seed", "custom"],
];

const LOCKFILES: Array<[file: string, pm: string]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lockb", "bun"],
  ["bun.lock", "bun"],
  ["package-lock.json", "npm"],
];

export type Pm = "npm" | "pnpm" | "yarn" | "bun";

export function pmName(packageManager: string | null | undefined): Pm {
  const name = packageManager?.split("@")[0];
  return name === "pnpm" || name === "yarn" || name === "bun" ? name : "npm";
}

export function runScript(pm: Pm, script: string): string {
  switch (pm) {
    case "npm":
      return script === "test" ? "npm test" : `npm run ${script}`;
    case "bun":
      return `bun run ${script}`;
    default:
      return `${pm} ${script}`;
  }
}

function execTool(pm: Pm, tool: string): string {
  const prefix: Record<Pm, string> = { npm: "npx", pnpm: "pnpm exec", yarn: "yarn", bun: "bunx" };
  return `${prefix[pm]} ${tool}`;
}

/** Args appended to the "test" script reach the runner directly, except npm which needs `--`. */
function testFileCommand(pm: Pm, testCommand: string): string {
  return pm === "npm" ? `${testCommand} -- {file}` : `${testCommand} {file}`;
}

export function detectJs(index: FileIndex, warnings: string[]): StackDetection {
  const raw = index.read("package.json");
  if (raw === null) return EMPTY_DETECTION;

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    warnings.push("package.json: invalid JSON, JS detection skipped");
    return EMPTY_DETECTION;
  }

  const deps: Record<string, unknown> = {
    ...(pkg.dependencies as object | undefined),
    ...(pkg.devDependencies as object | undefined),
  };

  // Package manager: explicit field beats lockfile presence; default npm.
  let packageManager: Fact<string> | null = null;
  if (typeof pkg.packageManager === "string" && pkg.packageManager.length > 0) {
    packageManager = { value: pkg.packageManager, provenance: "detected", source: "package.json#packageManager" };
  } else {
    for (const [file, pm] of LOCKFILES) {
      if (index.has(file)) {
        packageManager = { value: pm, provenance: "detected", source: file };
        break;
      }
    }
  }
  const pm = (packageManager?.value.split("@")[0] ?? "npm") as Pm;

  const frameworks: Fact<string>[] = [];
  for (const [dep, name] of Object.entries(FRAMEWORK_DEPS)) {
    if (dep in deps) frameworks.push(framework(name, deps[dep], `package.json#${dep}`));
  }
  if ("typescript" in deps) frameworks.push(framework("typescript", deps.typescript, "package.json#typescript"));

  const engines = pkg.engines as Record<string, unknown> | undefined;
  const runtime: Fact<string> | null =
    typeof engines?.node === "string"
      ? { value: `node${engines.node}`, provenance: "detected", source: "package.json#engines.node" }
      : { value: "node", provenance: "inferred", source: "heuristic:package.json-present" };

  const monorepo = detectWorkspaces(index, pkg);

  // --- Command catalog ---
  const commands: CatalogCommand[] = [];
  const seenKinds = new Set<CommandKind>();
  const add = (c: CatalogCommand) => {
    if (c.kind !== "custom" && seenKinds.has(c.kind)) return;
    seenKinds.add(c.kind);
    commands.push(c);
  };

  add({
    kind: "install",
    command: `${pm} install`,
    provenance: "detected",
    source: packageManager?.source ?? "heuristic:package.json-present",
  });

  const scripts = (pkg.scripts ?? {}) as Record<string, unknown>;
  for (const [script, kind] of SCRIPT_KINDS) {
    if (typeof scripts[script] !== "string") continue;
    const notes =
      kind === "test-e2e" && "@playwright/test" in deps ? "playwright: may need dev server running" : undefined;
    add({ kind, command: runScript(pm, script), provenance: "detected", source: `package.json#scripts.${script}`, notes });
  }

  // Synthesized (inferred) commands.
  const testCmd = commands.find((c) => c.kind === "test");
  if (testCmd && ("vitest" in deps || "jest" in deps)) {
    add({
      kind: "test-file",
      command: testFileCommand(pm, testCmd.command),
      provenance: "inferred",
      source: "heuristic:test-runner-accepts-file-arg",
    });
  }
  if (!seenKinds.has("typecheck") && "typescript" in deps && index.has("tsconfig.json")) {
    add({
      kind: "typecheck",
      command: `${execTool(pm, "tsc")} --noEmit`,
      provenance: "inferred",
      source: "heuristic:typescript-dep",
    });
  }
  const lintCmd = commands.find((c) => c.kind === "lint");
  if (lintCmd && !seenKinds.has("lint-fix") && "eslint" in deps) {
    add({
      kind: "lint-fix",
      command: `${lintCmd.command} --fix`,
      provenance: "inferred",
      source: "heuristic:eslint-supports-fix",
    });
  }

  return { frameworks, packageManager, runtime, monorepo, commands };
}

function detectWorkspaces(
  index: FileIndex,
  pkg: Record<string, unknown>,
): Fact<{ tool: string; packages: string[] }> | null {
  const wsYaml = index.read("pnpm-workspace.yaml");
  if (wsYaml !== null) {
    const packages = parseWorkspaceYamlPackages(wsYaml);
    if (packages.length > 0) {
      return { value: { tool: "pnpm-workspaces", packages }, provenance: "detected", source: "pnpm-workspace.yaml" };
    }
  }
  const ws = pkg.workspaces;
  const packages = Array.isArray(ws) ? ws.filter((p): p is string => typeof p === "string") : [];
  if (packages.length > 0) {
    return { value: { tool: "npm-workspaces", packages }, provenance: "detected", source: "package.json#workspaces" };
  }
  return null;
}

/** Minimal parse of the `packages:` list — avoids a YAML dependency for one key. */
function parseWorkspaceYamlPackages(yaml: string): string[] {
  const out: string[] = [];
  let inPackages = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const item = line.match(/^\s+-\s*['"]?([^'"#]+?)['"]?\s*$/);
      if (item?.[1]) out.push(item[1]);
      else if (/^\S/.test(line)) break;
    }
  }
  return out;
}
