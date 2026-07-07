import path from "node:path";
import { buildMap, loadConfig, scan, type DocContext } from "@iknowkungfu/core";
import { adapterArtifact } from "@iknowkungfu/adapters";
import type { Client } from "@iknowkungfu/schemas";
import type { GlobalOpts } from "./context";
import { docsFor, writeArtifacts, type ArtifactWriteReport } from "./generate";
import { readManifest, writeManifest, writeMap } from "./manifest-io";

export interface PipelineResult {
  ctx: DocContext;
  reports: ArtifactWriteReport[];
}

/** scan → manifest → map → docs. Shared by init and refresh. */
export async function runPipeline(root: string, g: GlobalOpts, opts: { force?: boolean } = {}): Promise<PipelineResult> {
  const loaded = loadConfig(root);
  const manifest = await scan(root, { loaded });
  const manifestResult = writeManifest(root, manifest, { dryRun: g.dryRun });
  const effective = manifestResult.fresh ? manifest : (readManifest(root) ?? manifest);
  const map = await buildMap(root, effective, { loaded });
  const mapResult = writeMap(root, map, { dryRun: g.dryRun });

  const ctx: DocContext = { name: path.basename(root), manifest: effective, map, config: loaded.config };
  const docReports = writeArtifacts(root, docsFor(root, effective, map, loaded.config), {
    dryRun: g.dryRun,
    force: opts.force,
  });
  return {
    ctx,
    reports: [
      { ...manifestResult, artifactId: "manifest", refreshedBlocks: [], warnings: [] },
      { ...mapResult, artifactId: "map", refreshedBlocks: [], warnings: [] },
      ...docReports,
    ],
  };
}

export function writeAdapters(
  root: string,
  ctx: DocContext,
  clients: Client[],
  g: GlobalOpts,
  force?: boolean,
): ArtifactWriteReport[] {
  const artifacts = clients.map((c) => adapterArtifact(c, ctx));
  return writeArtifacts(root, artifacts, { dryRun: g.dryRun, force });
}
