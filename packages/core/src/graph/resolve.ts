import type { FileIndex } from "../fsindex";
import { JS_EXTS } from "./imports";

const INDEX_SUFFIXES = JS_EXTS.map((e) => `/index${e}`);

function posixDirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

function normalize(parts: string[]): string | null {
  const out: string[] = [];
  for (const part of parts.join("/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join("/");
}

/** tsconfig `paths` alias like "@/*": ["./src/*"] — only simple prefix/* patterns supported. */
export interface JsAliases {
  entries: Array<{ prefix: string; targets: string[] }>;
}

export function parseTsconfigAliases(index: FileIndex): JsAliases {
  const raw = index.read("tsconfig.json");
  if (raw === null) return { entries: [] };
  let json: unknown;
  try {
    // tsconfig is JSONC — strip comments and trailing commas leniently.
    json = JSON.parse(
      raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"),
    );
  } catch {
    return { entries: [] };
  }
  const co = (json as Record<string, unknown>)?.compilerOptions as Record<string, unknown> | undefined;
  const paths = co?.paths as Record<string, unknown> | undefined;
  if (!paths) return { entries: [] };
  const baseUrl = typeof co?.baseUrl === "string" ? co.baseUrl.replace(/^\.\//, "").replace(/\/$/, "") : "";
  const entries: JsAliases["entries"] = [];
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!pattern.endsWith("/*") || !Array.isArray(targets)) continue;
    const prefix = pattern.slice(0, -1); // keep trailing "/"
    const resolved = targets
      .filter((t): t is string => typeof t === "string" && t.endsWith("/*"))
      .map((t) => {
        const base = t.slice(0, -1).replace(/^\.\//, "");
        return baseUrl ? `${baseUrl}/${base}` : base;
      });
    if (resolved.length > 0) entries.push({ prefix, targets: resolved });
  }
  return { entries };
}

function tryFile(index: FileIndex, candidate: string): string | null {
  if (index.has(candidate)) return candidate;
  for (const ext of JS_EXTS) if (index.has(candidate + ext)) return candidate + ext;
  for (const suffix of INDEX_SUFFIXES) if (index.has(candidate + suffix)) return candidate + suffix;
  return null;
}

/** Resolve a JS import specifier to a repo-internal file; null for packages/unresolvable. */
export function resolveJsImport(index: FileIndex, fromFile: string, spec: string, aliases: JsAliases): string | null {
  if (spec.startsWith(".")) {
    const joined = normalize([posixDirname(fromFile), spec]);
    return joined === null ? null : tryFile(index, joined);
  }
  for (const { prefix, targets } of aliases.entries) {
    if (!spec.startsWith(prefix)) continue;
    const rest = spec.slice(prefix.length);
    for (const target of targets) {
      const hit = tryFile(index, normalize([target + rest]) ?? "");
      if (hit) return hit;
    }
  }
  return null;
}

/** Resolve a Python dotted module to a repo file; relative dots resolve against the importer. */
export function resolvePyImport(index: FileIndex, fromFile: string, module: string): string | null {
  let baseParts: string[];
  let dotted = module;
  const rel = module.match(/^(\.+)(.*)$/);
  if (rel) {
    const ups = rel[1]!.length - 1;
    dotted = rel[2] ?? "";
    let dir = posixDirname(fromFile);
    for (let i = 0; i < ups; i++) dir = posixDirname(dir);
    baseParts = dir === "" ? [] : dir.split("/");
  } else {
    baseParts = [];
  }
  const modParts = dotted === "" ? [] : dotted.split(".");
  const full = [...baseParts, ...modParts].join("/");
  if (full === "") return null;
  if (index.has(`${full}.py`)) return `${full}.py`;
  if (index.has(`${full}/__init__.py`)) return `${full}/__init__.py`;
  return null;
}
