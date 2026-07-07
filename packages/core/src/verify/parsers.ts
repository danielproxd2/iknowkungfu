export interface ParsedFailure {
  file?: string;
  message: string;
}

const MAX_FAILURES = 20;

/** Best-effort by contract: verdicts come from exit codes, never from these. */
export function parseFailures(output: string): ParsedFailure[] {
  const failures: ParsedFailure[] = [];
  const push = (f: ParsedFailure) => {
    if (failures.length < MAX_FAILURES) failures.push(f);
  };

  for (const line of output.split("\n")) {
    // tsc: src/x.ts(10,5): error TS2322: ...
    const tsc = line.match(/^(.+\.[cm]?tsx?)\((\d+),\d+\): error (TS\d+: .+)$/);
    if (tsc) {
      push({ file: tsc[1], message: `${tsc[1]}(${tsc[2]}): ${tsc[3]}` });
      continue;
    }
    // pytest: FAILED tests/test_x.py::test_y - AssertionError: ...
    const pytest = line.match(/^FAILED (\S+)(?:\s+-\s+(.*))?$/);
    if (pytest) {
      push({ file: pytest[1]!.split("::")[0], message: line.trim() });
      continue;
    }
    // vitest/jest: FAIL  tests/x.test.ts > case  /  × case name
    const vitest = line.match(/^\s*(?:FAIL|×|✗|✕)\s+(.+)$/);
    if (vitest && !line.includes("Failed Tests")) {
      const target = vitest[1]!.trim();
      const file = target.match(/^(\S+\.[cm]?[jt]sx?)/)?.[1];
      push({ file, message: target });
      continue;
    }
    // Generic assertion lines add context to the previous failure.
    const assertion = line.match(/^\s*(AssertionError|Error|assert\b.*)[:\s](.*)$/);
    if (assertion && failures.length > 0 && failures[failures.length - 1]!.message.length < 200) {
      const last = failures[failures.length - 1]!;
      const detail = line.trim();
      if (!last.message.includes(detail)) last.message += ` — ${detail}`;
    }
  }
  return failures;
}

export function tail(output: string, lines = 50): string {
  const all = output.split("\n");
  return all.slice(Math.max(0, all.length - lines)).join("\n");
}
