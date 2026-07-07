import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isManagedPath } from "@repo-harness/core";

export interface WriteResult {
  path: string;
  action: "written" | "unchanged" | "dry-run";
}

/**
 * The ONLY function in the CLI allowed to write into the user's repo.
 * Refuses anything outside the managed-path allowlist; skips identical
 * content (zero-churn guarantee); honors --dry-run.
 */
export function writeManaged(root: string, rel: string, content: string, opts: { dryRun: boolean }): WriteResult {
  if (!isManagedPath(rel)) {
    throw new Error(`internal: attempted write outside managed paths: ${rel}`);
  }
  const abs = path.join(root, ...rel.split("/"));
  let existing: string | null = null;
  try {
    existing = readFileSync(abs, "utf8");
  } catch {
    existing = null;
  }
  if (existing === content) return { path: rel, action: "unchanged" };
  if (opts.dryRun) return { path: rel, action: "dry-run" };
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
  return { path: rel, action: "written" };
}

export function deleteManaged(root: string, rel: string, opts: { dryRun: boolean }): WriteResult {
  if (!isManagedPath(rel)) {
    throw new Error(`internal: attempted delete outside managed paths: ${rel}`);
  }
  if (opts.dryRun) return { path: rel, action: "dry-run" };
  rmSync(path.join(root, ...rel.split("/")), { force: true });
  return { path: rel, action: "written" };
}

export function readRepoFile(root: string, rel: string): string | null {
  try {
    return readFileSync(path.join(root, ...rel.split("/")), "utf8");
  } catch {
    return null;
  }
}
