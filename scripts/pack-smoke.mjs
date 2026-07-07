// Pack the CLI tarball, install it into a bare temp dir, and run `init` on both
// fixture stacks — proves the published artifact works cold on this OS/node.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliDir = path.join(root, "packages", "cli");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "pipe", encoding: "utf8", ...opts });

if (!existsSync(path.join(cliDir, "dist", "index.js"))) {
  console.error("pack-smoke: build first (pnpm build)");
  process.exit(2);
}

const stage = mkdtempSync(path.join(tmpdir(), "rh-pack-"));
try {
  run("npm", ["pack", "--pack-destination", stage], { cwd: cliDir, shell: process.platform === "win32" });
  const tarball = readdirSync(stage).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error("npm pack produced no tarball");

  const install = path.join(stage, "install");
  cpSync(path.join(root, "fixtures", "nextjs-pnpm"), path.join(install, "nextjs"), { recursive: true });
  cpSync(path.join(root, "fixtures", "fastapi-poetry"), path.join(install, "fastapi"), { recursive: true });
  run("npm", ["install", "--no-audit", "--no-fund", path.join(stage, tarball)], {
    cwd: install,
    shell: process.platform === "win32",
  });

  const bin = path.join(install, "node_modules", "repo-harness", "dist", "index.js");
  for (const [dir, expect] of [
    ["nextjs", "pnpm@9.6.0"],
    ["fastapi", "poetry"],
  ]) {
    const target = path.join(install, dir);
    const out = run(process.execPath, [bin, "init", "--yes", "--cwd", target]);
    if (!out.includes(expect)) throw new Error(`${dir}: expected '${expect}' in init output:\n${out}`);
    for (const rel of [".repo-harness/manifest.json", ".repo-harness/docs/PROJECT_CONTEXT.md", "AGENTS.md"]) {
      if (!existsSync(path.join(target, rel))) throw new Error(`${dir}: missing ${rel} after init`);
    }
    console.log(`pack-smoke: ${dir} OK (${expect})`);
  }
  console.log("pack-smoke: PASS");
} finally {
  rmSync(stage, { recursive: true, force: true });
}
