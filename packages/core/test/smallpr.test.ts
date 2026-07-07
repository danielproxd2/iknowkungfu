import { describe, expect, it } from "vitest";
import { parseConfig } from "@repo-harness/schemas";
import { buildMap, planSmallPr, scan } from "@repo-harness/core";
import { fixture } from "./util";

const root = fixture("nextjs-pnpm");
const manifest = await scan(root, { now: new Date(0) });
const map = await buildMap(root, manifest);
const ctx = { manifest, map, config: parseConfig({}) };

describe("planSmallPr (template mode)", () => {
  it("decomposes a schema+logic+route change into ordered steps with real verify commands", () => {
    const plan = planSmallPr("add discount codes to checkout", ["src/db/schema.ts", "src/lib/cart.ts", "src/app/api/cart/route.ts"], ctx);
    expect(plan.planQuality).toBe("template");
    expect(plan.splitRequired).toBe(true);
    expect(plan.steps.map((s) => s.title)).toEqual(["Schema / data model", "Domain logic + unit tests", "Integration (routes / UI)"]);
    const [schema, logic] = plan.steps;
    expect(schema!.verify).toContain("pnpm db:generate");
    expect(logic!.verify).toContain("pnpm test tests/lib/cart.test.ts");
    expect(logic!.files).toContain("tests/lib/cart.test.ts");
    for (const s of plan.steps) expect(s.verify).toContain("repo-harness risk --staged");
  });

  it("flags risk areas in the relevant step", () => {
    const plan = planSmallPr("update stripe fee handling", ["src/lib/payments/stripe.ts"], ctx);
    const logic = plan.steps.find((s) => s.title.includes("Domain logic"));
    expect(logic?.riskNotes.join(" ")).toContain("payments");
  });

  it("guesses candidate files from task wording when no hint is given", () => {
    const plan = planSmallPr("fix the cart total rounding", [], ctx);
    expect(plan.notes.join(" ")).toContain("guessed");
    expect(plan.steps.some((s) => s.files.includes("src/lib/cart.ts"))).toBe(true);
  });

  it("single-area small change → no split required", () => {
    const plan = planSmallPr("tweak logging", ["src/lib/cart.ts"], ctx);
    expect(plan.steps).toHaveLength(1);
    expect(plan.splitRequired).toBe(false);
  });
});
