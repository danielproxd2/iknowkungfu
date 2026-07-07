import type { Fact, FileRole } from "@iknowkungfu/schemas";

const CONFIG_EXACT = new Set([
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "pnpm-workspace.yaml",
  "Makefile",
  "justfile",
  ".gitignore",
  ".env.example",
  ".env.sample",
  ".env.template",
]);

interface RoleRule {
  role: FileRole;
  source: string;
  test(path: string): boolean;
}

/** Ordered — first match wins. */
const RULES: RoleRule[] = [
  {
    role: "test",
    source: "pattern:test-file",
    test: (p) =>
      /(^|\/)(tests?|__tests__|e2e)\//.test(p) ||
      /\.(test|spec)\.[cm]?[jt]sx?$/.test(p) ||
      /(^|\/)test_[^/]*\.py$/.test(p) ||
      /_test\.py$/.test(p),
  },
  { role: "migration", source: "pattern:migrations-dir", test: (p) => /(^|\/)migrations?\//.test(p) },
  { role: "generated", source: "pattern:generated", test: (p) => /\.(min\.js|d\.ts)$/.test(p) || /(^|\/)generated\//.test(p) },
  {
    role: "config",
    source: "pattern:config-file",
    test: (p) =>
      CONFIG_EXACT.has(p) ||
      /(^|\/)[^/]*\.config\.[cm]?[jt]s$/.test(p) ||
      /(^|\/)\.(eslintrc|prettierrc)[^/]*$/.test(p) ||
      /(^|\/)(requirements\.txt|setup\.py|setup\.cfg|tox\.ini)$/.test(p) ||
      (!p.includes("/") && (p.startsWith(".") || /\.(json|yaml|yml|toml|ini|lock|lockb)$/.test(p))),
  },
  { role: "script", source: "pattern:scripts-dir", test: (p) => /(^|\/)(scripts?|bin|tools)\//.test(p) },
  {
    role: "route",
    source: "pattern:router-file",
    test: (p) =>
      /(^|\/)app\/.*(page|layout|route|template|loading|error|not-found)\.[jt]sx?$/.test(p) ||
      /(^|\/)pages\/.+\.[jt]sx?$/.test(p) ||
      /(^|\/)(routes|routers|controllers)\//.test(p) ||
      /(^|\/)urls\.py$/.test(p),
  },
  {
    role: "data-model",
    source: "pattern:model-file",
    test: (p) =>
      /(^|\/)(schema|models?)\.(ts|js|py|prisma)$/.test(p) || /(^|\/)(models|entities)\//.test(p) || /\.sql$/.test(p),
  },
  { role: "ui-component", source: "pattern:component-ext", test: (p) => /\.(tsx|jsx|vue|svelte)$/.test(p) },
  { role: "docs", source: "pattern:docs-ext", test: (p) => /\.(md|mdx|rst|txt)$/.test(p) },
  {
    role: "asset",
    source: "pattern:asset-ext",
    test: (p) => /\.(png|jpe?g|gif|svg|ico|woff2?|ttf|eot|css|scss|mp4|webm|webp)$/.test(p),
  },
  { role: "core-logic", source: "pattern:code-ext", test: (p) => /\.[cm]?[jt]s$/.test(p) || /\.(py|go|rs|java|rb|c|cc|cpp|cs)$/.test(p) },
];

export function classifyRole(path: string): Fact<FileRole> {
  for (const rule of RULES) {
    if (rule.test(path)) return { value: rule.role, provenance: "inferred", source: rule.source };
  }
  return { value: "unknown", provenance: "inferred", source: "pattern:no-match" };
}
