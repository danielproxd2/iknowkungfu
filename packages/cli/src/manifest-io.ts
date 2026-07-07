import { MANIFEST_PATH } from "@repo-harness/core";
import { parseManifest, type RepoManifest } from "@repo-harness/schemas";
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
