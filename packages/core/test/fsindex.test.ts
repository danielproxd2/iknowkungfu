import { describe, expect, it } from "vitest";
import { buildFileIndex } from "@iknowkungfu/core";
import { fixture } from "./util";

describe("fsindex", () => {
  it("returns posix paths only, sorted", async () => {
    const index = await buildFileIndex(fixture("nextjs-pnpm"));
    expect(index.files.length).toBeGreaterThan(5);
    for (const f of index.files) expect(f).not.toContain("\\");
    expect([...index.files].sort()).toEqual(index.files);
  });

  it("respects .gitignore", async () => {
    const index = await buildFileIndex(fixture("nextjs-pnpm"));
    expect(index.files.some((f) => f.startsWith("generated-stuff/"))).toBe(false);
    expect(index.has("generated-stuff/ignored.txt")).toBe(false);
  });

  it("read() caches and returns null for missing files", async () => {
    const index = await buildFileIndex(fixture("nextjs-pnpm"));
    expect(index.read("package.json")).toContain("acme-shop");
    expect(index.read("does-not-exist.txt")).toBeNull();
    expect(index.warnings).toEqual([]);
  });
});
