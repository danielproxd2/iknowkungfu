import { describe, expect, it } from "vitest";
import { parseConfig } from "@iknowkungfu/schemas";
import { buildMap, riskCheck, scan, type ParsedDiffFile } from "@iknowkungfu/core";
import { fixture } from "./util";

const root = fixture("nextjs-pnpm");
const manifest = await scan(root, { now: new Date(0) });
const map = await buildMap(root, manifest);
const config = parseConfig({
  riskAreas: [
    {
      id: "payments",
      paths: ["src/lib/payments/**"],
      reason: "money movement",
      rules: [{ kind: "tests-first" }],
    },
    { id: "db-migrations", paths: ["src/db/migrations/**"], reason: "append-only", rules: [{ kind: "never-edit" }] },
  ],
});
const ctx = { map, config };

function diffFile(overrides: Partial<ParsedDiffFile> & { path: string }): ParsedDiffFile {
  return { oldPath: null, insertions: 5, deletions: 2, status: "modified", addedLines: [], ...overrides };
}

const rules = (files: ParsedDiffFile[]) => riskCheck(files, "staged", ctx);

describe("risk rules", () => {
  it("clean small diff → clean", () => {
    expect(rules([diffFile({ path: "src/lib/cart.ts" })]).verdict).toBe("clean");
  });

  it("user never-edit area edited → blocker; new file in it → not a blocker", () => {
    const edited = rules([diffFile({ path: "src/db/migrations/0001_init.sql" })]);
    expect(edited.verdict).toBe("blocked");
    expect(edited.findings[0]).toMatchObject({ rule: "never-edit", severity: "blocker" });

    const added = rules([diffFile({ path: "src/db/migrations/0002_new.sql", status: "added" })]);
    expect(added.verdict).not.toBe("blocked");
  });

  it("user risk area touched → warning with the area id in the message", () => {
    const report = rules([diffFile({ path: "src/lib/payments/stripe.ts" })]);
    expect(report.verdict).toBe("warnings");
    expect(report.findings[0]?.message).toContain("payments");
  });

  it("test deleted → blocker; .skip added → warning", () => {
    expect(rules([diffFile({ path: "tests/lib/cart.test.ts", status: "deleted" })]).verdict).toBe("blocked");
    const skipped = rules([diffFile({ path: "tests/lib/cart.test.ts", addedLines: ["it.skip('x', () => {})"] })]);
    expect(skipped.findings.map((f) => f.rule)).toContain("test-skipped");
    expect(skipped.verdict).toBe("warnings");
  });

  it("diff size: warn past warn limits, block past block limits", () => {
    const warn = rules(Array.from({ length: 6 }, (_, i) => diffFile({ path: `src/f${i}.ts` })));
    expect(warn.findings.map((f) => f.rule)).toContain("diff-size");
    expect(warn.verdict).toBe("warnings");

    const block = rules(Array.from({ length: 16 }, (_, i) => diffFile({ path: `src/f${i}.ts` })));
    expect(block.verdict).toBe("blocked");
  });

  it("lockfile churn without manifest change → warning", () => {
    const report = rules([diffFile({ path: "pnpm-lock.yaml" })]);
    expect(report.findings.map((f) => f.rule)).toContain("lockfile-churn");
    expect(rules([diffFile({ path: "pnpm-lock.yaml" }), diffFile({ path: "package.json" })]).findings.map((f) => f.rule)).not.toContain(
      "lockfile-churn",
    );
  });

  it("debug statements → warning; TODO → info; tests exempt", () => {
    const report = rules([diffFile({ path: "src/lib/cart.ts", addedLines: ["console.log(items)", "// TODO tidy"] })]);
    expect(report.findings.map((f) => f.rule)).toEqual(expect.arrayContaining(["debug-statement", "todo-added"]));
    const testFile = rules([diffFile({ path: "tests/lib/cart.test.ts", addedLines: ["console.log(1)"] })]);
    expect(testFile.findings.map((f) => f.rule)).not.toContain("debug-statement");
  });

  it("rename + edit → warning", () => {
    const report = rules([diffFile({ path: "src/lib/cart2.ts", oldPath: "src/lib/cart.ts", status: "renamed", insertions: 30 })]);
    expect(report.findings.map((f) => f.rule)).toContain("rename-plus-edit");
  });

  it("huge diff → content rules skipped, size rules kept, partial-analysis noted", () => {
    const report = rules([
      diffFile({ path: "src/big.ts", insertions: 6000, addedLines: ["console.log(1)"] }),
    ]);
    const ruleNames = report.findings.map((f) => f.rule);
    expect(ruleNames).toContain("partial-analysis");
    expect(ruleNames).toContain("diff-size");
    expect(ruleNames).not.toContain("debug-statement");
  });

  it("findings are ordered most-severe first", () => {
    const report = rules([
      diffFile({ path: "src/lib/cart.ts", addedLines: ["// TODO x"] }),
      diffFile({ path: "tests/lib/cart.test.ts", status: "deleted" }),
    ]);
    expect(report.findings[0]?.severity).toBe("blocker");
  });
});
