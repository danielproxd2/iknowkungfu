import { describe, expect, it } from "vitest";
import { scan } from "@iknowkungfu/core";
import { fixture } from "./util";

describe("scan determinism", () => {
  // Never delete or skip this test — determinism is a core guarantee (spec §9.3).
  it("identical repo state + clock → byte-identical manifest", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const a = await scan(fixture("nextjs-pnpm"), { now });
    const b = await scan(fixture("nextjs-pnpm"), { now });
    expect(JSON.stringify(a, null, 2)).toBe(JSON.stringify(b, null, 2));
  });
});
