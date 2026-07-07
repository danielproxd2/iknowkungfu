import { parse as parseToml } from "smol-toml";
import type { CatalogCommand, Fact } from "@iknowkungfu/schemas";
import type { FileIndex } from "../fsindex";
import { EMPTY_DETECTION, framework, type StackDetection } from "./types";

const PY_FRAMEWORKS = ["fastapi", "django", "flask", "pytest"];

type Toml = Record<string, unknown>;

function get(obj: unknown, ...keys: string[]): unknown {
  let cur = obj;
  for (const k of keys) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Toml)[k];
  }
  return cur;
}

function depName(spec: string): string {
  const m = spec.match(/^[A-Za-z0-9_.-]+/);
  return (m?.[0] ?? spec).toLowerCase();
}

/** dep name → raw version spec (or null), from all the places Python puts dependencies. */
function collectDeps(toml: Toml): Map<string, string | null> {
  const deps = new Map<string, string | null>();
  const addList = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (typeof item !== "string") continue;
      const name = depName(item);
      deps.set(name, item.slice(name.length).replace(/^[\s=<>~^!]+/, "") || null);
    }
  };
  const addTable = (table: unknown) => {
    if (table === null || typeof table !== "object") return;
    for (const [name, spec] of Object.entries(table as Toml)) {
      if (name === "python") continue;
      const version =
        typeof spec === "string" ? spec : typeof get(spec, "version") === "string" ? (get(spec, "version") as string) : null;
      deps.set(name.toLowerCase(), version);
    }
  };

  addList(get(toml, "project", "dependencies"));
  const optional = get(toml, "project", "optional-dependencies");
  if (optional && typeof optional === "object") for (const list of Object.values(optional as Toml)) addList(list);
  const groups = get(toml, "dependency-groups");
  if (groups && typeof groups === "object") for (const list of Object.values(groups as Toml)) addList(list);

  addTable(get(toml, "tool", "poetry", "dependencies"));
  const poetryGroups = get(toml, "tool", "poetry", "group");
  if (poetryGroups && typeof poetryGroups === "object") {
    for (const g of Object.values(poetryGroups as Toml)) addTable(get(g, "dependencies"));
  }
  return deps;
}

export function detectPython(index: FileIndex, warnings: string[]): StackDetection {
  const rawToml = index.read("pyproject.toml");
  const rawReqs = index.read("requirements.txt");
  if (rawToml === null && rawReqs === null) return EMPTY_DETECTION;

  let toml: Toml = {};
  if (rawToml !== null) {
    try {
      toml = parseToml(rawToml) as Toml;
    } catch {
      warnings.push("pyproject.toml: parse error, Python detection degraded");
    }
  }

  const deps = collectDeps(toml);
  if (rawReqs !== null) {
    for (const line of rawReqs.split(/\r?\n/)) {
      const clean = line.trim();
      if (!clean || clean.startsWith("#") || clean.startsWith("-")) continue;
      const name = depName(clean);
      if (!deps.has(name)) deps.set(name, null);
    }
  }

  // Package manager / runner prefix.
  let packageManager: Fact<string> | null = null;
  let prefix = "";
  if (index.has("uv.lock")) {
    packageManager = { value: "uv", provenance: "detected", source: "uv.lock" };
    prefix = "uv run ";
  } else if (index.has("poetry.lock") || get(toml, "tool", "poetry") !== undefined) {
    packageManager = { value: "poetry", provenance: "detected", source: index.has("poetry.lock") ? "poetry.lock" : "pyproject.toml#tool.poetry" };
    prefix = "poetry run ";
  } else if (rawReqs !== null) {
    packageManager = { value: "pip", provenance: "detected", source: "requirements.txt" };
  }

  const frameworks: Fact<string>[] = [];
  for (const name of PY_FRAMEWORKS) {
    if (deps.has(name)) frameworks.push(framework(name, deps.get(name), `pyproject.toml#${name}`));
  }

  const requiresPython =
    get(toml, "project", "requires-python") ?? get(toml, "tool", "poetry", "dependencies", "python");
  const runtime: Fact<string> | null =
    typeof requiresPython === "string"
      ? { value: `python${requiresPython}`, provenance: "detected", source: "pyproject.toml#requires-python" }
      : { value: "python", provenance: "inferred", source: "heuristic:pyproject-present" };

  const commands: CatalogCommand[] = [];
  if (packageManager) {
    const install: Record<string, string> = {
      uv: "uv sync",
      poetry: "poetry install",
      pip: "pip install -r requirements.txt",
    };
    const cmd = install[packageManager.value];
    if (cmd) commands.push({ kind: "install", command: cmd, provenance: "detected", source: packageManager.source });
  }
  if (deps.has("pytest")) {
    commands.push({ kind: "test", command: `${prefix}pytest`, provenance: "detected", source: "pyproject.toml#pytest" });
    commands.push({ kind: "test-file", command: `${prefix}pytest {file}`, provenance: "inferred", source: "heuristic:pytest-file-arg" });
  }
  if (deps.has("ruff")) {
    commands.push({ kind: "lint", command: `${prefix}ruff check .`, provenance: "inferred", source: "heuristic:ruff-dep" });
    commands.push({ kind: "format", command: `${prefix}ruff format .`, provenance: "inferred", source: "heuristic:ruff-dep" });
  }
  if (deps.has("mypy")) {
    commands.push({ kind: "typecheck", command: `${prefix}mypy .`, provenance: "inferred", source: "heuristic:mypy-dep" });
  }
  if (deps.has("django") && index.has("manage.py")) {
    commands.push({ kind: "dev", command: `${prefix}python manage.py runserver`, provenance: "inferred", source: "heuristic:django-manage.py" });
    commands.push({ kind: "migrate", command: `${prefix}python manage.py migrate`, provenance: "inferred", source: "heuristic:django-manage.py" });
  }

  return { frameworks, packageManager, runtime, monorepo: null, commands };
}
