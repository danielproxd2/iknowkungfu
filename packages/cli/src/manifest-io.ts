import { MANIFEST_PATH, MAP_PATH } from "@iknowkungfu/core";
import { parseManifest, parseMap, type ProjectMap, type RepoManifest } from "@iknowkungfu/schemas";
import { readRepoFile, writeManaged, type WriteResult } from "./write";

export function readManifest(root: string): RepoManifest | null {
  const raw = readRepoFile(root, MANIFEST_PATH);
  if (raw === null) return null;
  try {
    return parseManifest(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function readMap(root: string): ProjectMap | null {
  const raw = readRepoFile(root, MAP_PATH);
  if (raw === null) return null;
  try {
    return parseMap(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Skips the write when inputsHash is unchanged, preserving scannedAt (zero churn). */
export function writeManifest(
  root: string,
  manifest: RepoManifest,
  opts: { dryRun: boolean },
): WriteResult & { fresh: boolean } {
  const existing = readManifest(root);
  if (existing && existing.inputsHash === manifest.inputsHash && existing.harnessVersion === manifest.harnessVersion) {
    return { path: MANIFEST_PATH, action: "unchanged", fresh: false };
  }
  return { ...writeManaged(root, MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, opts), fresh: true };
}

export function writeMap(root: string, map: ProjectMap, opts: { dryRun: boolean }): WriteResult {
  return writeManaged(root, MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, opts);
}
