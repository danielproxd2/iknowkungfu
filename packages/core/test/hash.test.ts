import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildFileIndex, computeInputsHash } from "@iknowkungfu/core";
import { fixture } from "./util";

const tmp = mkdtempSync(path.join(tmpdir(), "rh-hash-"));
cpSync(fixture("nextjs-pnpm"), tmp, { recursive: true });
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

async function hash(): Promise<string> {
  return computeInputsHash(await buildFileIndex(tmp), null);
}

describe("inputsHash staleness primitive", () => {
  it("is stable across re-index (mtime-independent)", async () => {
    const a = await hash();
    writeFileSync(path.join(tmp, "src/lib/cart.ts"), (await buildFileIndex(tmp)).read("src/lib/cart.ts") ?? "", "utf8");
    expect(await hash()).toBe(a);
  });

  it("ignores source content changes but tracks manifest content changes", async () => {
    const before = await hash();
    // Source edit: not a tracked input, same file list → same hash.
    writeFileSync(path.join(tmp, "src/lib/cart.ts"), "export const changed = true;\n", "utf8");
    expect(await hash()).toBe(before);
    // package.json edit: tracked input → hash changes.
    writeFileSync(path.join(tmp, "package.json"), '{"name":"changed"}\n', "utf8");
    expect(await hash()).not.toBe(before);
  });

  it("tracks file adds/removes", async () => {
    const before = await hash();
    const added = path.join(tmp, "src/lib/new-module.ts");
    writeFileSync(added, "export {};\n", "utf8");
    const after = await hash();
    expect(after).not.toBe(before);
    rmSync(added);
    expect(await hash()).toBe(before);
  });

  it("ignores harness-managed paths entirely", async () => {
    const before = await hash();
    writeFileSync(path.join(tmp, "AGENTS.md"), "generated stuff\n", "utf8");
    expect(await hash()).toBe(before);
  });

  it("changes when config content changes", async () => {
    const index = await buildFileIndex(tmp);
    expect(computeInputsHash(index, '{"excludes":["docs/**"]}')).not.toBe(computeInputsHash(index, null));
  });
});
