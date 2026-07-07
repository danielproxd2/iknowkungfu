import { z } from "zod";
import { factSchema, provenanceSchema, SCHEMA_VERSION } from "./base";

export const commandKindSchema = z.enum([
  "install",
  "dev",
  "build",
  "test",
  "test-file",
  "test-e2e",
  "lint",
  "lint-fix",
  "typecheck",
  "format",
  "migrate",
  "custom",
]);
export type CommandKind = z.infer<typeof commandKindSchema>;

export const catalogCommandSchema = z.object({
  kind: commandKindSchema,
  command: z.string().min(1),
  cwd: z.string().optional(),
  provenance: provenanceSchema,
  source: z.string(),
  notes: z.string().optional(),
  lastVerifiedAt: z.string().optional(),
});
export type CatalogCommand = z.infer<typeof catalogCommandSchema>;

export const DEFAULT_VERIFY_ORDER: CommandKind[] = ["typecheck", "lint", "test-file", "test"];

export const commandCatalogSchema = z.object({
  commands: z.array(catalogCommandSchema),
  verifyOrder: z.array(commandKindSchema),
});
export type CommandCatalog = z.infer<typeof commandCatalogSchema>;

export const repoManifestSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  harnessVersion: z.string(),
  root: z.literal("."),
  scannedAt: z.string(),
  inputsHash: z.string(),
  stack: z.object({
    languages: z.array(factSchema(z.object({ name: z.string(), percent: z.number() }))),
    frameworks: z.array(factSchema(z.string())),
    packageManager: factSchema(z.string()).nullable(),
    runtime: factSchema(z.string()).nullable(),
    monorepo: factSchema(z.object({ tool: z.string(), packages: z.array(z.string()) })).nullable(),
  }),
  commands: commandCatalogSchema,
  env: z.object({
    exampleFile: z.string().nullable(),
    variables: z.array(factSchema(z.string())),
  }),
  stats: z.object({
    files: z.number().int().nonnegative(),
    sizeBytes: z.number().int().nonnegative(),
    gitCommits: z.number().int().nonnegative().nullable(),
  }),
  warnings: z.array(z.string()),
});
export type RepoManifest = z.infer<typeof repoManifestSchema>;

export function parseManifest(json: unknown): RepoManifest {
  return repoManifestSchema.parse(json);
}
