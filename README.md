# Repo Harness

**Make any repo AI-ready. Make weak models act like strong ones.**

Repo Harness scans your repository and precomputes what coding agents otherwise get wrong: an accurate project map, the *exact* build/test/lint commands, verification workflows, and risk guardrails — then exposes them to every agentic tool you use (Claude Code, Codex, Cursor, Copilot, anything MCP) from a single source of truth.

Local-first. Model-agnostic. **Works with zero API keys.**

```
$ npx repo-harness-cli init

Repo Harness v0.1.0 — init
✔ Detected: nextjs@15.1.0 · react@19.0.0 · vitest@2.1.0 · playwright@1.48.0 · TypeScript 96% · pnpm@9.6.0 · node>=20
✔ Command catalog: 9 detected, 2 inferred
✔ Mapped 16 files · 3 entrypoints
⚠ 2 core file(s) without tests

  written: .repo-harness/manifest.json
  written: .repo-harness/map.json
  written: .repo-harness/docs/PROJECT_CONTEXT.md   (+ 5 more docs)
  written: AGENTS.md · CLAUDE.md · .codex/skills/ · .cursor/rules/ · copilot-instructions

Done. Commit .repo-harness/ and the shims — your whole team's agents get them for free.
```

## Why

Weaker (cheaper, faster, local) models fail in real repos for predictable reasons: they explore poorly, invent commands, make oversized diffs, and don't verify. Strong models compensate with reasoning at inference time. Repo Harness moves that work to build time — deterministic, cached, and free — so the model spends its limited capability on your actual task.

Instructions alone don't fix this: a Cursor rule can *tell* a model to run the right tests, but it can't compute which tests those are. Repo Harness ships both — generated instructions **plus** the tools that do the deterministic work:

- `repo-harness verify --changed` maps your uncommitted changes through the import graph to the covering tests and runs exactly the right commands, cheap checks first, returning structured pass/fail (and an `uncovered` list — the honesty channel).
- `repo-harness risk --staged` is a deterministic pre-commit gate: risk-area paths, deleted tests, oversized diffs, lockfile churn, debug statements — each finding with a literal next action.
- `repo-harness refresh` re-scans and rewrites only stale marker blocks; your edits outside the blocks are never touched. `refresh --check` makes staleness a CI failure.
- `repo-harness mcp` serves it all as MCP tools: `repo_map`, `explain_file`, `find_tests_for_change`, `plan_small_pr`, `risk_check_diff`, `verify_change`, `refresh_context`, and more.

Every generated fact is provenance-tagged: untagged facts are parsed from your config files (trust them); `⚠ inferred` facts are heuristic (verify them). Writes are allow-listed to harness paths, always inside clearly-marked blocks, and `--dry-run` works on every writing command.

See [DEMO.md](DEMO.md) for the full loop with real captured output.

## Install

```bash
npm install -g repo-harness-cli    # or one-shot: npx repo-harness-cli init
# installs the `repo-harness` and `rh` commands
```

Node ≥ 20. macOS / Linux / Windows. No native modules.

## Quickstart

```bash
cd your-repo
repo-harness init        # scan + generate docs + write client adapters
repo-harness verify      # run the right checks for your current changes
repo-harness risk        # deterministic risk report for the staged diff
repo-harness refresh     # after the repo changes; only stale blocks rewritten
repo-harness audit       # harness health: staleness, integrity, coverage
```

Your agents then find, at the repo root:

- `AGENTS.md` → points every tool at the generated docs (thin shims for Claude/Codex/Cursor/Copilot)
- `.repo-harness/docs/PROJECT_CONTEXT.md` — structure, entry points, exact commands
- `.repo-harness/docs/AGENT_RUNBOOK.md` — the verify-before-and-after workflow
- `TEST_ORACLE.md` · `DEBUGGING_PLAYBOOKS.md` · `REFACTOR_GUARDRAILS.md` · `PROMPTS.md`

Declare your risk areas in `.repo-harness/config.json` (init asks once) — it's the highest-value 30 seconds of setup:

```json
{ "riskAreas": [{ "id": "payments", "paths": ["src/lib/payments/**"], "reason": "money movement", "rules": [{ "kind": "tests-first" }] }] }
```

## Supported today (v0.1)

- **Stacks:** TypeScript/JavaScript (npm/pnpm/yarn/bun; Next.js, Vite, Express/Fastify/Hono; vitest/jest/playwright) · Python (pyproject/requirements; Django, FastAPI, Flask; pytest). Other stacks degrade gracefully (file map, git stats, Makefile/justfile commands).
- **Adapters:** AGENTS.md · Claude Code · Codex skills · Cursor rules · GitHub Copilot instructions.
- **MCP:** stdio transport; register with `{"mcpServers":{"repo-harness":{"command":"repo-harness","args":["mcp"]}}}`.

## Roadmap

- v0.2 — Go, Rust, Java detection · tree-sitter WASM import graphs · `audit --deep` (execute catalog commands to prove liveness) · optional LLM enrichment (`--enrich`, any provider or shell command)
- v0.3 — monorepo-aware per-package catalogs · JetBrains/Windsurf adapters · HTTP MCP transport
- Later — semgrep/ESLint ingestion into risk rules · PR-review adapter (harness context in CI review bots)

## Contributing

Language detectors, risk rules, and client adapters are deliberately small, isolated modules — the best first contributions. Each fixture in `fixtures/` is a miniature real repo: add one for your stack, make the detector tests pass, done. Dev loop: `pnpm install && pnpm test` (builds the CLI, then runs 138 tests including integration tests against the built binary). See [CONTRIBUTING.md](CONTRIBUTING.md).

Non-negotiables: deterministic core (scan twice → identical bytes, enforced by test) · no native dependencies · user code never modified · generated docs stay under their line budgets (also a test).

MIT.
