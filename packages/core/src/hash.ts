import { createHash } from "node:crypto";
import type { FileIndex } from "./fsindex";
import { isManagedPath } from "./managed";

const TRACKED_EXACT = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-workspace.yaml",
  "pyproject.toml",
  "poetry.lock",
  "uv.lock",
  "requirements.txt",
  "Makefile",
  "makefile",
  "justfile",
  "Justfile",
  "tsconfig.json",
  ".env.example",
  ".env.sample",
  ".env.template",
]);

const TRACKED_PREFIXES = [".github/workflows/"];

export function isTrackedInput(rel: string): boolean {
  return TRACKED_EXACT.has(rel) || TRACKED_PREFIXES.some((p) => rel.startsWith(p));
}

/**
 * THE staleness primitive. Covers: the file list (adds/removes/renames) and the
 * CONTENT of detection inputs (manifests, lockfiles, configs, CI) + config.json.
 * Source-file content changes do not affect it; harness-managed paths never do.
 */
export function computeInputsHash(index: FileIndex, configRaw: string | null): string {
  const h = createHash("sha256");
  for (const f of index.files) {
    if (isManagedPath(f)) continue;
    h.update(f);
    h.update("\n");
  }
  for (const f of index.files) {
    if (!isTrackedInput(f)) continue;
    h.update(`\0${f}\0`);
    h.update(index.read(f) ?? "");
  }
  h.update("\0config\0");
  h.update(configRaw ?? "");
  return h.digest("hex").slice(0, 16);
}
