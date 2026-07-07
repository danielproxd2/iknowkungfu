import path from "node:path";
import {
  BlockCorruptionError,
  HarnessError,
  generateDocs,
  mergeArtifact,
  staleBlockIds,
  type GeneratedArtifact,
} from "@repo-harness/core";
import type { HarnessConfig, ProjectMap, RepoManifest } from "@repo-harness/schemas";
import { readRepoFile, writeManaged, type WriteResult } from "./write";

export interface ArtifactWriteReport extends WriteResult {
  artifactId: string;
  refreshedBlocks: string[];
  warnings: string[];
}

export function writeArtifacts(
  root: string,
  artifacts: GeneratedArtifact[],
  opts: { dryRun: boolean; force?: boolean },
): ArtifactWriteReport[] {
  const reports: ArtifactWriteReport[] = [];
  for (const artifact of artifacts) {
    const existing = readRepoFile(root, artifact.path);
    let content: string;
    let refreshed: string[];
    try {
      refreshed = opts.force ? artifact.blocks.map((b) => b.id) : staleBlockIds(existing, artifact);
      content = mergeArtifact(existing, artifact, { forceBlocks: opts.force });
    } catch (err) {
      if (!(err instanceof BlockCorruptionError)) throw err;
      if (!opts.force) {
        throw new HarnessError("findings", err.message, `Run with --force to rewrite ${artifact.path} cleanly.`);
      }
      // Repair path: markers are unrecoverable — rebuild the file from scratch.
      refreshed = artifact.blocks.map((b) => b.id);
      content = mergeArtifact(null, artifact);
    }
    const result = writeManaged(root, artifact.path, content, { dryRun: opts.dryRun });
    reports.push({
      ...result,
      artifactId: artifact.id,
      refreshedBlocks: result.action === "unchanged" ? [] : refreshed,
      warnings: artifact.warnings,
    });
  }
  return reports;
}

export function docsFor(root: string, manifest: RepoManifest, map: ProjectMap, config: HarnessConfig): GeneratedArtifact[] {
  return generateDocs(path.basename(root), manifest, map, config);
}
