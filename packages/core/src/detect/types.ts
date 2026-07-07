import type { CatalogCommand, Fact } from "@iknowkungfu/schemas";

export interface StackDetection {
  frameworks: Fact<string>[];
  packageManager: Fact<string> | null;
  runtime: Fact<string> | null;
  monorepo: Fact<{ tool: string; packages: string[] }> | null;
  commands: CatalogCommand[];
}

export const EMPTY_DETECTION: StackDetection = {
  frameworks: [],
  packageManager: null,
  runtime: null,
  monorepo: null,
  commands: [],
};

/** Strip range operators from a dep spec; return version if it looks concrete-ish. */
export function versionOf(spec: unknown): string | null {
  if (typeof spec !== "string") return null;
  const v = spec.replace(/^[\^~>=<\s]+/, "").trim();
  return /^\d/.test(v) ? v : null;
}

export function framework(name: string, spec: unknown, source: string): Fact<string> {
  const v = versionOf(spec);
  return { value: v ? `${name}@${v}` : name, provenance: "detected", source };
}
