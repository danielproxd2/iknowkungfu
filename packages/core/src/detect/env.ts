import type { Fact } from "@repo-harness/schemas";
import type { FileIndex } from "../fsindex";

const CANDIDATES = [".env.example", ".env.sample", ".env.template"];

/** Variable NAMES only — values are never read into the manifest. */
export function detectEnv(index: FileIndex): { exampleFile: string | null; variables: Fact<string>[] } {
  for (const file of CANDIDATES) {
    const content = index.read(file);
    if (content === null) continue;
    const variables: Fact<string>[] = [];
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (m?.[1]) variables.push({ value: m[1], provenance: "detected", source: file });
    }
    return { exampleFile: file, variables };
  }
  return { exampleFile: null, variables: [] };
}
