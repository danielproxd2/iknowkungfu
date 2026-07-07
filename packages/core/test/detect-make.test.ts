import { describe, expect, it } from "vitest";
import { parseManifest } from "@repo-harness/schemas";
import { scan } from "@repo-harness/core";
import { fixture } from "./util";

const manifest = parseManifest(await scan(fixture("makefile-only"), { now: new Date(0) }));
const byKind = (kind: string) => manifest.commands.commands.find((c) => c.kind === kind);

describe("detect: makefile-only fixture (graceful degradation)", () => {
  it("maps known targets to command kinds", () => {
    expect(byKind("build")).toMatchObject({ command: "make build", provenance: "detected", source: "Makefile#build" });
    expect(byKind("test")?.command).toBe("make test");
    expect(byKind("lint")?.command).toBe("make lint");
  });

  it("ignores unknown targets like clean", () => {
    expect(manifest.commands.commands.some((c) => c.command === "make clean")).toBe(false);
  });

  it("still reports languages and stats without a package manager", () => {
    expect(manifest.stack.packageManager).toBeNull();
    expect(manifest.stack.languages[0]?.value.name).toBe("C");
    expect(manifest.stats.files).toBeGreaterThan(0);
  });
});
