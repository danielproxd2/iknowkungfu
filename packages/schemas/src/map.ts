import { z } from "zod";
import { factSchema, SCHEMA_VERSION } from "./base";

export const fileRoleSchema = z.enum([
  "entrypoint",
  "route",
  "core-logic",
  "ui-component",
  "data-model",
  "migration",
  "test",
  "config",
  "script",
  "generated",
  "docs",
  "asset",
  "unknown",
]);
export type FileRole = z.infer<typeof fileRoleSchema>;

export const fileNodeSchema = z.object({
  /** posix-relative, always. */
  path: z.string(),
  role: factSchema(fileRoleSchema),
  lines: z.number().int().nonnegative(),
  /** Resolved repo-internal import targets only. */
  imports: z.array(z.string()),
  /** Reverse-edge count (full list derivable, not stored). */
  dependents: z.number().int().nonnegative(),
  /** Test files covering this file (direct import or naming convention). */
  tests: z.array(z.string()),
});
export type FileNode = z.infer<typeof fileNodeSchema>;

export const entrypointKindSchema = z.enum(["web", "api", "cli", "worker", "script"]);
export type EntrypointKind = z.infer<typeof entrypointKindSchema>;

export const projectMapSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** manifest.inputsHash this map was built from — mismatch ⇒ stale. */
  builtFromManifest: z.string(),
  directories: z.array(
    z.object({
      path: z.string(),
      role: factSchema(fileRoleSchema),
      summary: factSchema(z.string()).nullable(),
    }),
  ),
  files: z.array(fileNodeSchema),
  entrypoints: z.array(factSchema(z.object({ path: z.string(), kind: entrypointKindSchema, how: z.string() }))),
  /** core-logic/data-model files no test covers — the honesty channel. */
  untested: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type ProjectMap = z.infer<typeof projectMapSchema>;

export function parseMap(json: unknown): ProjectMap {
  return projectMapSchema.parse(json);
}
