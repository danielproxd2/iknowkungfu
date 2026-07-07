/**
 * Paths the harness is allowed to write — and therefore excludes from the
 * staleness hash (harness output must never make the harness look stale).
 * Single source of truth for both the write allowlist and hash exclusion.
 */
const MANAGED_FILES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  ".github/copilot-instructions.md",
  ".cursor/rules/repo-harness.mdc",
]);

const MANAGED_PREFIXES = [".repo-harness/", ".codex/skills/repo-harness/"];

export function isManagedPath(rel: string): boolean {
  return MANAGED_FILES.has(rel) || MANAGED_PREFIXES.some((p) => rel.startsWith(p));
}
