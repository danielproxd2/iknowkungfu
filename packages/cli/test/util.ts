import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));

export const BIN = path.resolve(here, "../dist/index.js");

export function fixture(name: string): string {
  return path.resolve(here, "../../../fixtures", name);
}

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Run the BUILT binary — integration tests exercise what ships, not the sources. */
export async function runCli(args: string[], opts: { cwd?: string } = {}): Promise<CliResult> {
  try {
    const { stdout, stderr } = await pexec(process.execPath, [BIN, ...args], { cwd: opts.cwd });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: typeof e.code === "number" ? e.code : 1 };
  }
}
