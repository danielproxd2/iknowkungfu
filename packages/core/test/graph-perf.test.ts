import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildMap, scan } from "@iknowkungfu/core";

// Perf guard from the plan: scan+map < 5s on 5k synthetic files.
const tmp = mkdtempSync(path.join(tmpdir(), "rh-perf-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("graph performance", () => {
  it("scan + buildMap on 5k files completes in < 5s", async () => {
    writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "perf", scripts: { test: "vitest run" } }));
    const perDir = 50;
    for (let d = 0; d < 100; d++) {
      const dir = path.join(tmp, "src", `mod${d}`);
      mkdirSync(dir, { recursive: true });
      for (let f = 0; f < perDir; f++) {
        const prev = f > 0 ? `import { v${f - 1} } from "./file${f - 1}";\n` : "";
        writeFileSync(path.join(dir, `file${f}.ts`), `${prev}export const v${f} = ${f};\n`);
      }
    }
    const started = Date.now();
    const manifest = await scan(tmp, { now: new Date(0) });
    const map = await buildMap(tmp, manifest);
    const elapsed = Date.now() - started;
    expect(map.files.length).toBe(5001);
    expect(map.files.filter((f) => f.imports.length > 0).length).toBe(4900);
    expect(elapsed).toBeLessThan(5000);
  }, 30_000);
});
