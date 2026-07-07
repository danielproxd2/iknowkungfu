import { describe, expect, it } from "vitest";
import { buildMap, planVerify, scan } from "@iknowkungfu/core";
import { fixture } from "./util";

const root = fixture("nextjs-pnpm");
const manifest = await scan(root, { now: new Date(0) });
const map = await buildMap(root, manifest);

describe("planVerify", () => {
  it("baseline/full: cheap checks then the full suite", () => {
    const plan = planVerify("baseline", [], manifest, map);
    expect(plan.commands).toEqual(["pnpm typecheck", "pnpm lint", "pnpm test"]);
  });

  it("changed file with a covering test → scoped test-file run, no full suite", () => {
    const plan = planVerify("changed", ["src/lib/cart.ts"], manifest, map);
    expect(plan.commands).toEqual(["pnpm typecheck", "pnpm lint", "pnpm test tests/lib/cart.test.ts"]);
    expect(plan.uncovered).toEqual([]);
  });

  it("uncovered change → scoped tests plus full suite, and the file is reported", () => {
    const plan = planVerify("changed", ["src/lib/payments/stripe.ts"], manifest, map);
    expect(plan.uncovered).toEqual(["src/lib/payments/stripe.ts"]);
    expect(plan.commands).toContain("pnpm test");
  });

  it("data-model change → full suite", () => {
    const plan = planVerify("changed", ["src/db/schema.ts"], manifest, map);
    expect(plan.commands).toContain("pnpm test");
  });

  it("dependency manifest change → full suite", () => {
    const plan = planVerify("changed", ["package.json"], manifest, map);
    expect(plan.commands).toContain("pnpm test");
  });

  it("empty changeset → cheap checks only, with a note", () => {
    const plan = planVerify("changed", [], manifest, map);
    expect(plan.commands).toEqual(["pnpm typecheck", "pnpm lint"]);
    expect(plan.notes[0]).toContain("no changes");
  });
});
