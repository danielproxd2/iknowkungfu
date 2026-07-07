import { z } from "zod";

export const SCHEMA_VERSION = 1;

export const provenanceSchema = z.enum(["detected", "inferred", "llm", "user"]);
export type Provenance = z.infer<typeof provenanceSchema>;

export function factSchema<T extends z.ZodType>(value: T) {
  return z.object({
    value,
    provenance: provenanceSchema,
    source: z.string(),
  });
}
export interface Fact<T> {
  value: T;
  provenance: Provenance;
  source: string;
}
