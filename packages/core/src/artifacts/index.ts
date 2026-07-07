import type { HarnessConfig, ProjectMap, RepoManifest } from "@repo-harness/schemas";
import type { DocContext } from "./context";
import { guardrailsArtifact } from "./guardrails";
import { playbooksArtifact } from "./playbooks";
import { projectContextArtifact } from "./project-context";
import { promptsArtifact } from "./prompts";
import { runbookArtifact } from "./runbook";
import { testOracleArtifact } from "./test-oracle";
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

export { promptDefs, type PromptDef } from "./prompts";

export function generateDocs(name: string, manifest: RepoManifest, map: ProjectMap, config: HarnessConfig): GeneratedArtifact[] {
  const ctx: DocContext = { name, manifest, map, config };
  return [
    projectContextArtifact(ctx),
    runbookArtifact(ctx),
    testOracleArtifact(ctx),
    playbooksArtifact(ctx),
    guardrailsArtifact(ctx),
    promptsArtifact(ctx),
  ];
}
