import { z } from "zod";
import { SCHEMA_VERSION } from "./base";

export const riskFindingSchema = z.object({
  severity: z.enum(["blocker", "warning", "info"]),
  rule: z.string(),
  file: z.string().optional(),
  message: z.string(),
  /** The literal next action — weak models need the verb. */
  suggestion: z.string(),
});
export type RiskFinding = z.infer<typeof riskFindingSchema>;

export const riskReportSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  range: z.string(),
  summary: z.object({
    files: z.number().int().nonnegative(),
    insertions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
  }),
  findings: z.array(riskFindingSchema),
  verdict: z.enum(["clean", "warnings", "blocked"]),
});
export type RiskReport = z.infer<typeof riskReportSchema>;
