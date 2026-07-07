import { execa, execaCommand } from "execa";
import {
  SCHEMA_VERSION,
  type CommandRunResult,
  type VerificationResult,
} from "@repo-harness/schemas";
import { parseFailures, tail } from "./parsers";
import type { VerifyPlan } from "./plan";

export interface RunVerifyOptions {
  timeoutMs?: number;
  /** Live output sink (stderr in the CLI); structured capture happens regardless. */
  onOutput?: (chunk: string) => void;
  now?: () => Date;
}

const DEFAULT_TIMEOUT_MS = 600_000;

async function runOne(command: string, cwd: string, opts: RunVerifyOptions): Promise<CommandRunResult> {
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const win32 = process.platform === "win32";
  // execa's own timeout kills only the shell; the actual command is often a
  // grandchild that survives, keeps the stdio pipes open, and hangs the await
  // (observed on Linux and Windows). Kill the whole tree ourselves instead:
  // POSIX gets its own process group (detached) killed by -pid, Windows uses
  // taskkill /T.
  const subprocess = execaCommand(command, {
    cwd,
    shell: true,
    all: true,
    reject: false,
    detached: !win32,
    env: { FORCE_COLOR: "0" },
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (win32) {
      void execa("taskkill", ["/pid", String(subprocess.pid), "/t", "/f"], { reject: false });
    } else {
      try {
        process.kill(-(subprocess.pid as number), "SIGKILL");
      } catch {
        subprocess.kill("SIGKILL");
      }
    }
  }, timeoutMs);
  const result = await subprocess;
  clearTimeout(timer);
  const output = result.all ?? "";
  if (opts.onOutput && output.length > 0) opts.onOutput(`${output}\n`);

  let status: CommandRunResult["status"];
  if (result.timedOut || timedOut) status = "timeout";
  else if (result.exitCode === 127 || /command not found|not recognized as an internal/i.test(output) || result.failed && result.exitCode === undefined)
    status = "not-found";
  else status = result.exitCode === 0 ? "pass" : "fail";

  return {
    command,
    status,
    exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
    durationMs: Date.now() - started,
    failures: status === "fail" ? parseFailures(output) : [],
    outputTail: tail(output),
  };
}

export async function runVerify(root: string, plan: VerifyPlan, opts: RunVerifyOptions = {}): Promise<VerificationResult> {
  const startedAt = (opts.now?.() ?? new Date()).toISOString();
  const started = Date.now();
  const commands: CommandRunResult[] = [];
  for (const command of plan.commands) {
    if (opts.onOutput) opts.onOutput(`\n$ ${command}\n`);
    commands.push(await runOne(command, root, opts));
  }
  const anyBad = commands.some((c) => c.status === "fail" || c.status === "timeout");
  const anyMissing = commands.some((c) => c.status === "not-found" || c.status === "skipped");
  return {
    schemaVersion: SCHEMA_VERSION,
    scope: plan.scope,
    changedFiles: plan.changedFiles,
    commands,
    uncovered: plan.uncovered,
    verdict: anyBad ? "fail" : anyMissing ? "partial" : "pass",
    startedAt,
    totalDurationMs: Date.now() - started,
  };
}
