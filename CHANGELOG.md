# Changelog

## 1.0.1 — 2026-07-07

- **Fix:** `verify` now kills the entire process tree when a command hits its timeout. Previously only the wrapping shell was killed, so on Linux and Windows a hung command survived, held the output pipes, and `verify` hung with it (macOS was unaffected). POSIX commands now run in their own process group and the group gets SIGKILL; Windows uses `taskkill /T /F`.
- CI: monorepo dev loop tested on Node 22/24 (pnpm 11 requires ≥ 22.13); the published CLI's Node 20 support is covered by a dedicated packed-tarball smoke job.

## 1.0.0 — 2026-07-07

First public release, published to npm as **`repo-harness-cli`** (the name `repo-harness` was already taken on the registry; the installed commands are still `repo-harness` and `rh`).

Everything below is relative to nothing — this is the initial release. Highlights:

- **`init`** — scan the repo (deterministic, gitignore-aware), detect stack/tooling, build the import graph, and generate `.repo-harness/` artifacts: `manifest.json`, `map.json`, and six docs (`PROJECT_CONTEXT`, `AGENT_RUNBOOK`, `TEST_ORACLE`, `DEBUGGING_PLAYBOOKS`, `REFACTOR_GUARDRAILS`, `PROMPTS`), each under a hard line budget.
- **Adapters** — thin shims for every major agent client from one source of truth: `AGENTS.md`, `CLAUDE.md`, Codex skills, Cursor rules, Copilot instructions.
- **`verify [--changed]`** — map uncommitted changes through the import graph to the covering tests; run exactly the right commands, cheap checks first; structured pass/fail plus an `uncovered` honesty channel.
- **`risk [--staged]`** — deterministic pre-commit gate: risk-area paths, deleted tests, oversized diffs, lockfile churn, debug statements; every finding carries a literal next action.
- **`refresh [--check]`** — re-scan and rewrite only stale marker blocks; user edits outside blocks are never touched; `--check` makes staleness a CI failure.
- **`audit`** — harness health: staleness, artifact integrity, doc coverage.
- **`mcp`** — stdio MCP server exposing `repo_map`, `explain_file`, `find_tests_for_change`, `plan_small_pr`, `risk_check_diff`, `verify_change`, `refresh_context`, and more.
- **Stacks:** TypeScript/JavaScript (npm/pnpm/yarn/bun; Next.js, Vite, Express/Fastify/Hono; vitest/jest/playwright) and Python (pyproject/requirements; Django, FastAPI, Flask; pytest); other stacks degrade gracefully.
- **Guarantees (test-enforced):** deterministic scans (scan twice → identical bytes), writes allow-listed to harness paths inside marked blocks, generated docs stay within line budgets, user text survives `refresh`, zero native dependencies, works with zero API keys.

### 0.1.0 (unpublished)

Internal milestone: the same feature set, tagged before the npm rename and release hardening. Never published to a registry.
