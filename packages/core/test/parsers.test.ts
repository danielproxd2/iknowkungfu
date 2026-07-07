import { describe, expect, it } from "vitest";
import { parseFailures } from "@repo-harness/core";

describe("reporter parsers (best-effort by contract)", () => {
  it("parses tsc errors", () => {
    const out = "src/lib/cart.ts(12,3): error TS2322: Type 'string' is not assignable to type 'number'.";
    expect(parseFailures(out)).toEqual([
      { file: "src/lib/cart.ts", message: "src/lib/cart.ts(12): TS2322: Type 'string' is not assignable to type 'number'." },
    ]);
  });

  it("parses vitest FAIL lines with assertion context", () => {
    const out = ["FAIL tests/calc.test.mjs > add", "AssertionError: expected 4 to be 5"].join("\n");
    const failures = parseFailures(out);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.file).toBe("tests/calc.test.mjs");
    expect(failures[0]?.message).toContain("expected 4 to be 5");
  });

  it("parses pytest FAILED lines", () => {
    const out = "FAILED tests/test_main.py::test_app - AssertionError: assert None is not None";
    const failures = parseFailures(out);
    expect(failures[0]?.file).toBe("tests/test_main.py");
    expect(failures[0]?.message).toContain("test_app");
  });

  it("caps parsed failures", () => {
    const out = Array.from({ length: 50 }, (_, i) => `FAIL tests/t${i}.test.ts > c`).join("\n");
    expect(parseFailures(out).length).toBeLessThanOrEqual(20);
  });
});
