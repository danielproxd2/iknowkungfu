#!/usr/bin/env node
import { Command } from "commander";
import { EXIT_CODES, HARNESS_VERSION, HarnessError } from "@repo-harness/core";
import { registerGenerate } from "./commands/generate";
import { registerScan } from "./commands/scan";

const program = new Command("repo-harness")
  .description("Turn any repository into an AI-ready workspace.")
  .version(HARNESS_VERSION)
  .option("--json", "machine-readable output")
  .option("--quiet", "suppress non-essential output")
  .option("--dry-run", "print planned writes without touching anything")
  .option("--cwd <path>", "run as if started in <path>");

registerScan(program);
registerGenerate(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  const json = process.argv.includes("--json");
  if (err instanceof HarnessError) {
    if (json) {
      console.log(JSON.stringify({ error: { code: err.code, message: err.message, fix: err.fix ?? null } }));
    } else {
      console.error(`error: ${err.message}`);
      if (err.fix) console.error(`fix: ${err.fix}`);
    }
    process.exit(EXIT_CODES[err.code]);
  }
  console.error(err instanceof Error ? `unexpected error: ${err.stack ?? err.message}` : String(err));
  process.exit(EXIT_CODES.env);
});
