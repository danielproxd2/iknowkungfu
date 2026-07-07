# MCP Server

`repo-harness mcp` serves the harness as [Model Context Protocol](https://modelcontextprotocol.io) tools over stdio. Agents get precomputed, deterministic answers — a repo map, exact commands, test coverage for a change — instead of burning context exploring the tree or guessing.

## Registration

The server must run with the target repo as its working directory (clients handle this when registered per-project).

**Claude Code** — `.mcp.json` at the repo root (or `claude mcp add repo-harness -- repo-harness mcp`):

```json
{ "mcpServers": { "repo-harness": { "command": "repo-harness", "args": ["mcp"] } } }
```

**Cursor** — `.cursor/mcp.json`, **Codex** — `~/.codex/config.toml`, and any other stdio MCP client: same command, same args.

Add `--readonly` to the args to disable the one writing tool (`refresh_context`) — useful when the client should never mutate the workspace.

## Staleness

Every tool response includes `stale: true` when the repo has drifted from the harness artifacts. When you see it, call `refresh_context` (or run `repo-harness refresh`) and retry.

## Read tools

| Tool | What it answers |
|---|---|
| `repo_map` | Structural map of the repo (precomputed): directories, file roles, dependents, risk areas. Use instead of exploring the tree. Inputs: `dir` (narrow to a directory), `depth` (default 2). Output is capped; `truncated: true` + a hint tells you to narrow. |
| `explain_file` | Everything knowable about one file before touching it: role, exports, imports, dependents, covering tests, risk area, size, last change. Input: `path`. |
| `find_entrypoints` | Where execution starts: web roots, API routes, CLIs, runnable scripts — with the exact command to run each. |
| `find_tests_for_change` | Map changed files to the tests and EXACT commands that must pass. Input: `files` (default: current uncommitted changes from git). |
| `get_commands` | The exact command catalog (build/test/lint/etc). Never guess a command — read it from here. |

## Action tools

| Tool | What it does |
|---|---|
| `verify_change` | Run the repo's own checks (typecheck/lint/scoped tests) and return structured pass/fail. The loop-closer: use after every logical change instead of claiming "should work". Inputs: `scope` (`changed` default / `full` / `baseline`), `files`, `timeoutSec` (default 600). |
| `risk_check_diff` | Deterministic pre-commit risk gate: risk areas, deleted tests, oversized diffs, debug statements. Input: `range` (default: staged diff). Address every blocker before finishing. |
| `plan_small_pr` | Decompose a task into small, independently-verifiable steps with exact verify commands and risk notes. Use when a change would exceed ~5 files. Inputs: `task`, `touchHint`. |
| `refresh_context` | Re-scan the repo and rewrite stale harness docs/adapters. Call when any tool reports `stale: true`. Disabled under `--readonly`. Input: `force`. |

## Error shape

Tools fail with a structured payload rather than free text:

```json
{ "code": "usage", "message": "Not in the map: src/nope.ts", "fix": "Check the path via repo_map; run refresh_context if the file is new." }
```

`code` is `findings`, `usage`, or `env` — same taxonomy as the CLI exit codes.
