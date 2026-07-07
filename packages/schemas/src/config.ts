import { z } from "zod";
import { provenanceSchema } from "./base";
import { catalogCommandSchema } from "./manifest";

export const clientSchema = z.enum(["agents-md", "claude", "codex", "cursor", "copilot"]);
export type Client = z.infer<typeof clientSchema>;
export const ALL_CLIENTS: Client[] = ["agents-md", "claude", "codex", "cursor", "copilot"];

export const riskRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("max-files-per-change"), value: z.number().int().positive() }),
  z.object({ kind: z.literal("tests-first") }),
  z.object({ kind: z.literal("never-edit") }),
  z.object({ kind: z.literal("flag-in-report") }),
]);
export type RiskRule = z.infer<typeof riskRuleSchema>;

export const riskAreaSchema = z.object({
  id: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1),
  reason: z.string().min(1),
  provenance: provenanceSchema.default("user"),
  rules: z.array(riskRuleSchema).default([]),
});
export type RiskArea = z.infer<typeof riskAreaSchema>;

export const diffLimitsSchema = z.object({
  warnFiles: z.number().int().positive().default(5),
  warnLines: z.number().int().positive().default(150),
  blockFiles: z.number().int().positive().default(15),
  blockLines: z.number().int().positive().default(600),
});
export type DiffLimits = z.infer<typeof diffLimitsSchema>;

/** All fields optional with defaults — an empty (or absent) config.json must work. */
export const harnessConfigSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  clients: z.array(clientSchema).default([...ALL_CLIENTS]),
  excludes: z.array(z.string()).default([]),
  riskAreas: z.array(riskAreaSchema).default([]),
  diffLimits: diffLimitsSchema.prefault({}),
  /** User-declared commands; replace detected ones of the same kind (provenance forced to "user"). */
  commandOverrides: z.array(catalogCommandSchema.omit({ provenance: true })).default([]),
  mapMaxFiles: z.number().int().positive().default(20_000),
});
export type HarnessConfig = z.infer<typeof harnessConfigSchema>;

export function parseConfig(json: unknown): HarnessConfig {
  return harnessConfigSchema.parse(json);
}
