import { describe, expect, it } from "vitest";
import { parseMap } from "@repo-harness/schemas";
import { buildMap, scan } from "@repo-harness/core";
import { fixture } from "./util";

const nextRoot = fixture("nextjs-pnpm");
const nextManifest = await scan(nextRoot, { now: new Date(0) });
const nextMap = parseMap(await buildMap(nextRoot, nextManifest));
const node = (p: string) => nextMap.files.find((f) => f.path === p);

const pyRoot = fixture("fastapi-poetry");
const pyMap = parseMap(await buildMap(pyRoot, await scan(pyRoot, { now: new Date(0) })));
const pyNode = (p: string) => pyMap.files.find((f) => f.path === p);

describe("graph: imports & reverse deps (nextjs fixture)", () => {
  it("resolves tsconfig alias imports (@/lib/cart)", () => {
    expect(node("src/app/page.tsx")?.imports).toContain("src/lib/cart.ts");
    expect(node("src/app/api/cart/route.ts")?.imports).toContain("src/lib/cart.ts");
  });

  it("resolves relative imports exactly", () => {
    expect(node("src/lib/payments/stripe.ts")?.imports).toEqual(["src/lib/cart.ts"]);
  });

  it("counts dependents (page, route, stripe, test import cart)", () => {
    expect(node("src/lib/cart.ts")?.dependents).toBe(4);
    expect(node("src/lib/payments/stripe.ts")?.dependents).toBe(0);
  });

  it("map is deterministic", async () => {
    const again = await buildMap(nextRoot, nextManifest);
    expect(JSON.stringify(again)).toBe(JSON.stringify(nextMap));
  });
});

describe("graph: roles", () => {
  const cases: Array<[string, string]> = [
    ["src/lib/cart.ts", "core-logic"],
    ["src/app/page.tsx", "route"],
    ["src/app/api/cart/route.ts", "route"],
    ["src/db/schema.ts", "data-model"],
    ["src/db/migrations/0001_init.sql", "migration"],
    ["tests/lib/cart.test.ts", "test"],
    ["e2e/checkout.spec.ts", "test"],
    ["scripts/seed.ts", "script"],
    ["next.config.ts", "config"],
    ["package.json", "config"],
  ];
  it.each(cases)("%s → %s", (path, role) => {
    expect(node(path)?.role.value).toBe(role);
    expect(node(path)?.role.provenance).toBe("inferred");
  });
});

describe("graph: test mapping & untested", () => {
  it("maps cart.ts to its test via import", () => {
    expect(node("src/lib/cart.ts")?.tests).toContain("tests/lib/cart.test.ts");
  });

  it("flags stripe.ts and schema.ts as untested", () => {
    expect(nextMap.untested).toContain("src/lib/payments/stripe.ts");
    expect(nextMap.untested).toContain("src/db/schema.ts");
    expect(nextMap.untested).not.toContain("src/lib/cart.ts");
  });
});

describe("graph: entrypoints", () => {
  it("finds the web root, api route, and seed script", () => {
    const eps = nextMap.entrypoints.map((e) => e.value);
    expect(eps).toContainEqual(expect.objectContaining({ path: "src/app/layout.tsx", kind: "web" }));
    expect(eps).toContainEqual(expect.objectContaining({ path: "src/app/api/cart/route.ts", kind: "api" }));
    expect(eps).toContainEqual(expect.objectContaining({ path: "scripts/seed.ts", kind: "script", how: "pnpm seed" }));
  });
});

describe("graph: python (fastapi fixture)", () => {
  it("resolves absolute and relative python imports", () => {
    expect(pyNode("app/main.py")?.imports).toEqual(["app/db.py", "app/models.py"]);
  });

  it("maps tests by import and naming", () => {
    expect(pyNode("app/main.py")?.tests).toContain("tests/test_main.py");
  });

  it("finds the FastAPI entrypoint", () => {
    expect(pyMap.entrypoints.map((e) => e.value)).toContainEqual(
      expect.objectContaining({ path: "app/main.py", kind: "api", how: "uvicorn app.main:app" }),
    );
  });
});
