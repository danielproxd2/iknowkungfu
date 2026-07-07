import { blockHash, type ArtifactBlock, type GeneratedArtifact } from "./blocks";
import { topDependents, type DocContext } from "./context";

const BUDGET = 100;

function commandsByKind(ctx: DocContext): Map<string, string> {
  return new Map(ctx.manifest.commands.commands.map((c) => [c.kind, c.command]));
}

function matrixBlock(ctx: DocContext): ArtifactBlock {
  const byKind = commandsByKind(ctx);
  const cheap = ["typecheck", "lint"].map((k) => byKind.get(k)).filter(Boolean);
  const test = byKind.get("test");
  const testFile = byKind.get("test-file");
  const migrate = byKind.get("migrate");
  const install = byKind.get("install");
  const build = byKind.get("build");

  const rows: Array<[string, string]> = [];
  if (cheap.length > 0) rows.push(["anything", cheap.map((c) => `\`${c}\``).join(" then ")]);
  const srcDirs = ctx.map.directories.filter((d) => !d.path.includes("/") && ["core-logic", "ui-component", "route"].includes(d.role.value));
  for (const dir of srcDirs.slice(0, 4)) {
    const scoped = testFile ? `\`${testFile.replace("{file}", `<its test>`)}\` then ` : "";
    if (test) rows.push([`\`${dir.path}/**\``, `${scoped}\`${test}\``]);
  }
  const modelFiles = ctx.map.files.filter((f) => f.role.value === "data-model").slice(0, 2);
  for (const f of modelFiles) {
    const cmds = [migrate, test].filter(Boolean).map((c) => `\`${c}\``);
    if (cmds.length > 0) rows.push([`\`${f.path}\``, cmds.join(" then ")]);
  }
  if (install && test) rows.push(["dependencies", [`\`${install}\``, build ? `\`${build}\`` : "", `\`${test}\``].filter(Boolean).join(" then ")]);

  const content = [
    "## Change type → required checks",
    "| You changed… | Must pass |",
    "|--------------|-----------|",
    ...rows.map(([a, b]) => `| ${a} | ${b} |`),
  ].join("\n");
  return { id: "matrix", inputs: blockHash(rows), content };
}

function mappingBlock(ctx: DocContext): ArtifactBlock {
  const top = topDependents(ctx.map, 6)
    .map(({ path }) => ctx.map.files.find((f) => f.path === path))
    .filter((f) => f !== undefined && f.tests.length > 0)
    .slice(0, 5);
  const lines = top.map((f) => `- \`${f!.path}\` ← ${f!.tests.map((t) => `\`${t}\``).join(", ")}`);
  const untested = ctx.map.untested;
  const content = [
    "## Test ↔ source map (highest-dependents files)",
    ...(lines.length > 0 ? lines : ["- no import-linked tests found"]),
    "",
    untested.length > 0
      ? `⚠ ${untested.length} core file(s) have NO covering test — full list: \`iknowkungfu audit --untested\``
      : "All core files have at least one covering test.",
  ].join("\n");
  return { id: "mapping", inputs: blockHash({ lines, untested: untested.length }), content };
}

function rulesBlock(ctx: DocContext): ArtifactBlock {
  const untested = ctx.map.untested.slice(0, 5);
  const content = [
    "## Oracle rules",
    "- A green suite is necessary, not sufficient: state in your report when no test covers your change.",
    ...(untested.length > 0
      ? [`- Known uncovered files (first ${untested.length}): ${untested.map((u) => `\`${u}\``).join(", ")}`]
      : []),
    "- Never mark a change verified from reasoning alone — run the commands in the matrix above.",
  ].join("\n");
  return { id: "oracle-rules", inputs: blockHash(untested), content };
}

export function testOracleArtifact(ctx: DocContext): GeneratedArtifact {
  return {
    id: "test-oracle",
    path: ".iknowkungfu/docs/TEST_ORACLE.md",
    blocks: [
      { id: "title", inputs: blockHash("title-v1"), content: "# Test Oracle" },
      matrixBlock(ctx),
      mappingBlock(ctx),
      rulesBlock(ctx),
    ],
    ownership: "managed-file",
    lineBudget: BUDGET,
    warnings: [],
  };
}
