import { readFileSync } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import ignoreFactory from "ignore";
import { HarnessError } from "./errors";
import { isManagedPath } from "./managed";

const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/out/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/.venv/**",
  "**/venv/**",
  "**/target/**",
  "**/.turbo/**",
  "**/.pytest_cache/**",
  "**/.iknowkungfu/**",
];

const MAX_FILES = 200_000;

export interface FileIndex {
  root: string;
  /** posix-relative paths, sorted. */
  files: string[];
  has(rel: string): boolean;
  /** Cached read; null if missing or unreadable (unreadable adds a warning). */
  read(rel: string): string | null;
  size(rel: string): number;
  totalBytes: number;
  warnings: string[];
}

export async function buildFileIndex(
  root: string,
  opts: { excludes?: string[] } = {},
): Promise<FileIndex> {
  const warnings: string[] = [];
  const entries = await fg("**/*", {
    cwd: root,
    dot: true,
    onlyFiles: true,
    stats: true,
    followSymbolicLinks: false,
    suppressErrors: true,
    ignore: [...DEFAULT_EXCLUDES, ...(opts.excludes ?? [])],
  });

  const ig = ignoreFactory();
  const gitignore = safeReadFile(path.join(root, ".gitignore"));
  if (gitignore !== null) ig.add(gitignore);

  const sizes = new Map<string, number>();
  for (const e of entries) {
    // Harness output must never feed back into detection, hashing, or the map.
    if (isManagedPath(e.path) || ig.ignores(e.path)) continue;
    sizes.set(e.path, e.stats?.size ?? 0);
  }

  if (sizes.size > MAX_FILES) {
    throw new HarnessError(
      "usage",
      `Repo has ${sizes.size} files (max ${MAX_FILES}).`,
      "Add exclude globs to .iknowkungfu/config.json and re-run.",
    );
  }

  const files = [...sizes.keys()].sort();
  const cache = new Map<string, string | null>();
  let totalBytes = 0;
  for (const s of sizes.values()) totalBytes += s;

  return {
    root,
    files,
    totalBytes,
    warnings,
    has: (rel) => sizes.has(rel),
    size: (rel) => sizes.get(rel) ?? 0,
    read(rel) {
      if (cache.has(rel)) return cache.get(rel) ?? null;
      if (!sizes.has(rel)) {
        cache.set(rel, null);
        return null;
      }
      const content = safeReadFile(path.join(root, ...rel.split("/")));
      if (content === null) warnings.push(`unreadable: ${rel}`);
      cache.set(rel, content);
      return content;
    },
  };
}

function safeReadFile(abs: string): string | null {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}
