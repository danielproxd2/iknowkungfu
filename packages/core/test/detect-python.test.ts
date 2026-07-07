import { describe, expect, it } from "vitest";
import { parseManifest } from "@iknowkungfu/schemas";
import { scan } from "@iknowkungfu/core";
import { fixture } from "./util";

const manifest = parseManifest(await scan(fixture("fastapi-poetry"), { now: new Date(0) }));
const byKind = (kind: string) => manifest.commands.commands.find((c) => c.kind === kind);

describe("detect: fastapi-poetry fixture", () => {
  it("detects poetry and fastapi + pytest", () => {
    expect(manifest.stack.packageManager?.value).toBe("poetry");
    const values = manifest.stack.frameworks.map((f) => f.value);
    expect(values).toContain("fastapi@0.115.0");
    expect(values).toContain("pytest@8.3.0");
  });

  it("detects the python runtime requirement", () => {
    expect(manifest.stack.runtime?.value).toContain("3.12");
  });

  it("builds poetry-prefixed commands", () => {
    expect(byKind("install")?.command).toBe("poetry install");
    expect(byKind("test")).toMatchObject({ command: "poetry run pytest", provenance: "detected" });
    expect(byKind("test-file")).toMatchObject({ command: "poetry run pytest {file}", provenance: "inferred" });
    expect(byKind("lint")).toMatchObject({ command: "poetry run ruff check .", provenance: "inferred" });
    expect(byKind("typecheck")).toMatchObject({ command: "poetry run mypy .", provenance: "inferred" });
  });

  it("Python is the dominant language", () => {
    expect(manifest.stack.languages[0]?.value.name).toBe("Python");
  });
});
