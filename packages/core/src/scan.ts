import {
  DEFAULT_VERIFY_ORDER,
  SCHEMA_VERSION,
  type CatalogCommand,
  type RepoManifest,
} from "@iknowkungfu/schemas";
import { loadConfig, type LoadedConfig } from "./config";
import { detectEnv } from "./detect/env";
import { detectJs } from "./detect/js";
import { detectLanguages } from "./detect/languages";
import { detectMake } from "./detect/make";
import { detectPython } from "./detect/python";
import type { StackDetection } from "./detect/types";
import { buildFileIndex, type FileIndex } from "./fsindex";
import { gitCommitCount } from "./gitinfo";
import { computeInputsHash } from "./hash";
import { HARNESS_VERSION } from "./version";

export interface ScanOptions {
  /** Injected clock so identical repo state → identical manifest (determinism guarantee). */
  now?: Date;
  /** Pre-loaded config (avoids a double read when the caller already has it). */
  loaded?: LoadedConfig;
}

/** Earlier detections win: package scripts beat pyproject beat Makefile, per kind. */
function mergeCommands(detections: StackDetection[]): CatalogCommand[] {
  const merged: CatalogCommand[] = [];
  const seenKinds = new Set<string>();
  const seenCommands = new Set<string>();
  for (const d of detections) {
    for (const c of d.commands) {
      if (c.kind === "custom" ? seenCommands.has(c.command) : seenKinds.has(c.kind)) continue;
      seenKinds.add(c.kind);
      seenCommands.add(c.command);
      merged.push(c);
    }
  }
  return merged;
}

function firstNonNull<T>(items: Array<T | null>): T | null {
  for (const item of items) if (item !== null) return item;
  return null;
}

export async function scan(root: string, opts: ScanOptions = {}): Promise<RepoManifest> {
  const { config, raw: configRaw } = opts.loaded ?? loadConfig(root);
  const index: FileIndex = await buildFileIndex(root, { excludes: config.excludes });
  const warnings = index.warnings;

  const detections = [detectJs(index, warnings), detectPython(index, warnings), detectMake(index)];
  const gitCommits = await gitCommitCount(root);

  let commands = mergeCommands(detections);
  for (const override of config.commandOverrides) {
    commands = commands.filter((c) => c.kind !== override.kind || c.kind === "custom");
    commands.push({ ...override, provenance: "user" });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    harnessVersion: HARNESS_VERSION,
    root: ".",
    scannedAt: (opts.now ?? new Date()).toISOString(),
    inputsHash: computeInputsHash(index, configRaw),
    stack: {
      languages: detectLanguages(index),
      frameworks: detections.flatMap((d) => d.frameworks),
      packageManager: firstNonNull(detections.map((d) => d.packageManager)),
      runtime: firstNonNull(detections.map((d) => d.runtime)),
      monorepo: firstNonNull(detections.map((d) => d.monorepo)),
    },
    commands: {
      commands,
      verifyOrder: DEFAULT_VERIFY_ORDER,
    },
    env: detectEnv(index),
    stats: { files: index.files.length, sizeBytes: index.totalBytes, gitCommits },
    warnings: [...warnings],
  };
}
