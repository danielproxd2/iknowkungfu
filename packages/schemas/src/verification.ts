import { z } from "zod";
import { SCHEMA_VERSION } from "./base";

export const commandRunResultSchema = z.object({
  command: z.string(),
  status: z.enum(["pass", "fail", "timeout", "skipped", "not-found"]),
  exitCode: z.number().int().nullable(),
  durationMs: z.number().nonnegative(),
  /** Parsed where the reporter format is known (tsc/vitest/jest/pytest); best-effort. */
  failures: z.array(z.object({ file: z.string().optional(), message: z.string() })),
  /** Last ~50 lines — the universal fallback when parsing fails. */
  outputTail: z.string(),
});
export type CommandRunResult = z.infer<typeof commandRunResultSchema>;

export const verificationResultSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  scope: z.enum(["changed", "full", "baseline"]),
  changedFiles: z.array(z.string()),
  commands: z.array(commandRunResultSchema),
  /** Changed code files no executed test covers — the honesty channel. */
  uncovered: z.array(z.string()),
  verdict: z.enum(["pass", "fail", "partial"]),
  startedAt: z.string(),
  totalDurationMs: z.number().nonnegative(),
});
export type VerificationResult = z.infer<typeof verificationResultSchema>;
