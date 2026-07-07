import {
  SCHEMA_VERSION,
  type Fact,
  type FileNode,
  type FileRole,
  type ProjectMap,
  type RepoManifest,
} from "@iknowkungfu/schemas";
import { loadConfig, type LoadedConfig } from "../config";
import { pmName, runScript } from "../detect/js";
import { buildFileIndex, type FileIndex } from "../fsindex";
import { initImportParser, isJsFile, isPyFile, jsImportSpecifiers, pyImportSpecifiers } from "./imports";
import { parseTsconfigAliases, resolveJsImport, resolvePyImport } from "./resolve";
import { classifyRole } from "./roles";
import { nameMatchesSource } from "./testmap";

const MAX_READ_BYTES = 512 * 1024;
const TESTABLE_ROLES: ReadonlySet<FileRole> = new Set(["core-logic", "data-model"]);

export interface BuildMapOptions {
  loaded?: LoadedConfig;
}

export async function buildMap(root: string, manifest: RepoManifest, opts: BuildMapOptions = {}): Promise<ProjectMap> {
  await initImportParser();
  const { config } = opts.loaded ?? loadConfig(root);
  const index = await buildFileIndex(root, { excludes: config.excludes });
  const warnings: string[] = [];

  let paths = index.files;
  if (paths.length > config.mapMaxFiles) {
    warnings.push(`map capped at ${config.mapMaxFiles} of ${paths.length} files (config.mapMaxFiles)`);
    paths = paths.slice(0, config.mapMaxFiles);
  }

  const aliases = parseTsconfigAliases(index);
  const nodes = new Map<string, FileNode>();
  for (const path of paths) {
    nodes.set(path, { path, role: classifyRole(path), lines: 0, imports: [], dependents: 0, tests: [] });
  }

  // Content pass: line counts + resolved repo-internal imports.
  for (const node of nodes.values()) {
    const role = node.role.value;
    if (role === "asset" || role === "generated" || index.size(node.path) > MAX_READ_BYTES) continue;
    const content = index.read(node.path);
    if (content === null) continue;
    node.lines = content.length === 0 ? 0 : content.split("\n").length;

    let targets: string[] = [];
    if (isJsFile(node.path)) {
      targets = jsImportSpecifiers(content)
        .map((spec) => resolveJsImport(index, node.path, spec, aliases))
        .filter((t): t is string => t !== null);
    } else if (isPyFile(node.path)) {
      targets = pyImportSpecifiers(content)
        .map((imp) => resolvePyImport(index, node.path, imp.module))
        .filter((t): t is string => t !== null);
    }
    node.imports = [...new Set(targets)].filter((t) => t !== node.path && nodes.has(t)).sort();
  }

  // Reverse edges + import-based test coverage.
  const testFiles = [...nodes.values()].filter((n) => n.role.value === "test");
  for (const node of nodes.values()) {
    for (const target of node.imports) {
      const t = nodes.get(target);
      if (!t) continue;
      t.dependents += 1;
      if (node.role.value === "test") t.tests.push(node.path);
    }
  }

  // Naming-convention coverage (union with import-based).
  for (const node of nodes.values()) {
    if (!TESTABLE_ROLES.has(node.role.value)) continue;
    for (const test of testFiles) {
      if (!node.tests.includes(test.path) && nameMatchesSource(test.path, node.path)) node.tests.push(test.path);
    }
    node.tests.sort();
  }

  const untested = [...nodes.values()]
    .filter((n) => TESTABLE_ROLES.has(n.role.value) && n.tests.length === 0)
    .map((n) => n.path)
    .sort();

  return {
    schemaVersion: SCHEMA_VERSION,
    builtFromManifest: manifest.inputsHash,
    directories: buildDirectories(nodes),
    files: [...nodes.values()],
    entrypoints: detectEntrypoints(index, manifest),
    untested,
    warnings,
  };
}

function buildDirectories(nodes: Map<string, FileNode>): ProjectMap["directories"] {
  const byDir = new Map<string, Map<FileRole, number>>();
  for (const node of nodes.values()) {
    const segments = node.path.split("/");
    for (const depth of [1, 2]) {
      if (segments.length <= depth) break;
      const dir = segments.slice(0, depth).join("/");
      const counts = byDir.get(dir) ?? new Map<FileRole, number>();
      counts.set(node.role.value, (counts.get(node.role.value) ?? 0) + 1);
      byDir.set(dir, counts);
    }
  }
  const out: ProjectMap["directories"] = [];
  for (const [dir, counts] of [...byDir.entries()].sort()) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (dir.includes("/") && total < 3) continue;
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    out.push({
      path: dir,
      role: { value: dominant, provenance: "inferred", source: "dominant-child-role" },
      summary: null,
    });
  }
  return out;
}

function detectEntrypoints(index: FileIndex, manifest: RepoManifest): ProjectMap["entrypoints"] {
  const out: ProjectMap["entrypoints"] = [];
  const push = (path: string, kind: "web" | "api" | "cli" | "worker" | "script", how: string, provenance: Fact<string>["provenance"], source: string) =>
    out.push({ value: { path, kind, how }, provenance, source });

  const pm = pmName(manifest.stack.packageManager?.value);
  const devCmd = manifest.commands.commands.find((c) => c.kind === "dev")?.command;

  const pkgRaw = index.read("package.json");
  if (pkgRaw !== null) {
    let pkg: Record<string, unknown> = {};
    try {
      pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    } catch {
      /* already warned during scan */
    }
    const bin = pkg.bin;
    const binEntries =
      typeof bin === "string" ? { [String(pkg.name ?? "cli")]: bin } : ((bin ?? {}) as Record<string, unknown>);
    for (const [name, target] of Object.entries(binEntries)) {
      if (typeof target === "string") push(target.replace(/^\.\//, ""), "cli", name, "detected", "package.json#bin");
    }
    // Scripts that point at a repo file are runnable entrypoints.
    for (const [name, value] of Object.entries((pkg.scripts ?? {}) as Record<string, unknown>)) {
      if (typeof value !== "string") continue;
      const fileRef = value.match(/(?:^|\s)([\w@./-]+\.(?:ts|tsx|js|mjs|cjs|py))(?:\s|$)/)?.[1]?.replace(/^\.\//, "");
      if (fileRef && index.has(fileRef)) push(fileRef, "script", runScript(pm, name), "detected", `package.json#scripts.${name}`);
    }
  }

  for (const layout of ["src/app/layout.tsx", "src/app/layout.jsx", "app/layout.tsx", "app/layout.jsx"]) {
    if (index.has(layout)) {
      push(layout, "web", devCmd ?? "next dev", "detected", "nextjs:app-router");
      break;
    }
  }
  const apiRoutes = index.files.filter((f) => /(^|\/)app\/.*route\.[jt]s$/.test(f));
  for (const route of apiRoutes.slice(0, 10)) push(route, "api", devCmd ?? "framework dev server", "detected", "nextjs:route-handler");
  if (apiRoutes.length > 10) push(`(${apiRoutes.length - 10} more route handlers)`, "api", "see repo_map", "detected", "nextjs:route-handler");

  for (const main of ["app/main.py", "src/main.py", "main.py"]) {
    const content = index.has(main) ? index.read(main) : null;
    if (content === null) continue;
    if (content.includes("FastAPI(")) {
      push(main, "api", `uvicorn ${main.replace(/\.py$/, "").replaceAll("/", ".")}:app`, "inferred", "heuristic:fastapi-app");
    } else {
      push(main, "script", `python ${main}`, "inferred", "heuristic:main-py");
    }
    break;
  }
  if (index.has("manage.py")) push("manage.py", "cli", "python manage.py", "detected", "django:manage.py");
  if (index.has("index.html") && index.has("vite.config.ts")) push("index.html", "web", devCmd ?? "vite dev", "detected", "vite:index-html");

  return out.slice(0, 25);
}
