import type { CatalogCommand, CommandKind } from "@iknowkungfu/schemas";
import type { FileIndex } from "../fsindex";
import { EMPTY_DETECTION, type StackDetection } from "./types";

/** Ordered: earlier rows win per kind (e.g. `test` beats `check`). */
const TARGET_KINDS: Array<[target: string, kind: CommandKind]> = [
  ["test", "test"],
  ["check", "test"],
  ["build", "build"],
  ["all", "build"],
  ["lint", "lint"],
  ["fmt", "format"],
  ["format", "format"],
  ["typecheck", "typecheck"],
  ["dev", "dev"],
  ["run", "dev"],
  ["install", "install"],
];

function parseTargets(content: string): Set<string> {
  const targets = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_.-]+)\s*:(?!=)/);
    if (m?.[1] && !m[1].startsWith(".") && !m[1].includes("%")) targets.add(m[1]);
  }
  return targets;
}

export function detectMake(index: FileIndex): StackDetection {
  const runners: Array<[file: string, run: string]> = [
    ["Makefile", "make"],
    ["makefile", "make"],
    ["justfile", "just"],
    ["Justfile", "just"],
  ];
  for (const [file, run] of runners) {
    const content = index.read(file);
    if (content === null) continue;
    const targets = parseTargets(content);
    const commands: CatalogCommand[] = [];
    const seen = new Set<CommandKind>();
    for (const [target, kind] of TARGET_KINDS) {
      if (!targets.has(target) || seen.has(kind)) continue;
      seen.add(kind);
      commands.push({ kind, command: `${run} ${target}`, provenance: "detected", source: `${file}#${target}` });
    }
    return { ...EMPTY_DETECTION, commands };
  }
  return EMPTY_DETECTION;
}
