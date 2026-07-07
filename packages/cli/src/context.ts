import { statSync } from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { HarnessError } from "@iknowkungfu/core";

export interface GlobalOpts {
  json: boolean;
  quiet: boolean;
  dryRun: boolean;
  root: string;
}

export function globalOpts(cmd: Command): GlobalOpts {
  const g = cmd.optsWithGlobals<{ json?: boolean; quiet?: boolean; dryRun?: boolean; cwd?: string }>();
  const root = path.resolve(g.cwd ?? process.cwd());
  let isDir = false;
  try {
    isDir = statSync(root).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) throw new HarnessError("usage", `Not a directory: ${root}`, "Pass a valid path via --cwd.");
  return { json: g.json ?? false, quiet: g.quiet ?? false, dryRun: g.dryRun ?? false, root };
}
