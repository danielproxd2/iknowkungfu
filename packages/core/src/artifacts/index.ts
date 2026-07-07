import type { HarnessConfig, ProjectMap, RepoManifest } from "@repo-harness/schemas";
import type { DocContext } from "./context";
import { projectContextArtifact } from "./project-context";
import { runbookArtifact } from "./runbook";
import type { GeneratedArtifact } from "./blocks";

export {
  BlockCorruptionError,
  blockHash,
  fileHeader,
  mergeArtifact,
  staleBlockIds,
  type ArtifactBlock,
  type GeneratedArtifact,
} from "./blocks";
export type { DocContext } from "./context";

export function generateDocs(name: string, manifest: RepoManifest, map: ProjectMap, config: HarnessConfig): GeneratedArtifact[] {
  const ctx: DocContext = { name, manifest, map, config };
  return [projectContextArtifact(ctx), runbookArtifact(ctx)];
}
