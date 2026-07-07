# CLI Reference

Installed as `iknowkungfu` with the short alias `kungfu` (identical). Every command below works with the global options.

```
npm install -g iknowkungfu
```

## Global options

| Option | Effect |
|---|---|
| `--json` | Machine-readable output on stdout (errors too — see [JSON mode](#json-mode)) |
| `--quiet` | Suppress non-essential output |
| `--dry-run` | Print planned writes without touching anything (works on every writing command) |
| `--cwd <path>` | Run as if started in `<path>` |
| `-V, --version` | Print version |

## Exit codes

Consistent across all commands, designed for CI and agent harnesses:

| Code | Meaning |
|---|---|
| `0` | Success — no findings |
| `1` | Findings — a check failed, a risk rule blocked, or `--check` detected staleness |
| `2` | Usage error — bad flag, path not in the map, malformed config |
| `3` | Environment error — a needed tool is missing on this machine |

---

## `iknowkungfu init`

One-shot setup: scan, generate docs, write client adapters. Idempotent — safe to re-run.

| Option | Effect |
|---|---|
| `--yes` | No prompts, sensible defaults |
| `--clients <list>` | Comma-separated clients (default: `agents-md,claude,codex,cursor,copilot`) |
| `--no-mcp-hint` | Skip the `.mcp.json` registration hint |

Writes `.iknowkungfu/{manifest,map,config}.json`, six docs under `.iknowkungfu/docs/`, and the client shims. Commit all of it — your whole team's agents get the harness for free.

## `iknowkungfu scan`

Detect stack, commands, and structure; write `.iknowkungfu/{manifest,map}.json`. Deterministic: scanning twice produces identical bytes (test-enforced).

| Option | Effect |
|---|---|
| `--print` | Print manifest JSON to stdout, write nothing |
| `--timing` | Print scan duration |

## `iknowkungfu refresh`

Re-scan and rewrite **only stale harness blocks**. Your edits outside the marked blocks always survive (test-enforced).

| Option | Effect |
|---|---|
| `--force` | Rewrite all blocks from scratch |
| `--check` | Exit 1 if anything *would* change; write nothing — wire this into CI or pre-commit |

## `iknowkungfu generate`

Render harness docs from the current manifest and map (without re-scanning).

| Option | Effect |
|---|---|
| `--force` | Rewrite all blocks, discarding existing block bodies |

## `iknowkungfu audit`

Harness health report: staleness, marker integrity, shim coverage, doc line budgets.

| Option | Effect |
|---|---|
| `--untested` | Also list core files no test covers |

## `iknowkungfu adapt`

Write client shims: `AGENTS.md`, `CLAUDE.md`, Codex skill, Cursor rule, Copilot instructions.

| Option | Effect |
|---|---|
| `--client <name...>` | Clients to adapt (default: `clients` from config) |
| `--list` | Show adapter status without writing |
| `--remove <name>` | Remove a client's shim (or its harness block) |

## `iknowkungfu verify`

Run the right checks for a changeset; structured pass/fail. Maps your changed files through the import graph to the covering tests and runs exactly the right commands, cheap checks first. Reports an `uncovered` list — files no test covers — as an honesty channel.

| Option | Effect |
|---|---|
| `--changed` | Scope to uncommitted changes (default) |
| `--full` | Run the full check suite |
| `--baseline` | Verify the tree is green *before* starting work |
| `--files <paths...>` | Explicit changed files (overrides git detection) |
| `--timeout <sec>` | Per-command timeout in seconds (default 600). Hung commands are killed — the whole process tree, on every platform |

Exit: `1` if any command failed or timed out, `3` if a catalog command isn't installed on this machine (fix: install it, or override the command in `.iknowkungfu/config.json`).

## `iknowkungfu risk`

Deterministic risk report for a diff — a pre-commit gate with no model in the loop. Checks: declared risk-area paths, deleted tests, oversized diffs, lockfile churn, debug statements. Every finding comes with a literal next action.

| Option | Effect |
|---|---|
| `--staged` | Check the staged diff (default) |
| `--range <range>` | Check a git range, e.g. `main..HEAD` |
| `--strict` | Warnings also exit 1 (for CI/pre-commit) |

Exit: `1` when blocked (or on warnings with `--strict`).

## `iknowkungfu mcp`

Serve the iknowkungfu MCP server over stdio. Not run by hand — launched by MCP clients; see [MCP.md](MCP.md).

| Option | Effect |
|---|---|
| `--readonly` | Disable the `refresh_context` tool (server never writes) |

---

## JSON mode

Every command accepts `--json` and emits a single JSON document on stdout — including on failure, so agents can parse errors instead of scraping stderr:

```bash
iknowkungfu verify --changed --json
iknowkungfu risk --staged --json
```

Failure payloads carry `code` (`findings` | `usage` | `env`), `message`, and a `fix` field with the literal next action.

## Typical CI wiring

```yaml
- run: iknowkungfu refresh --check   # harness docs must not be stale
- run: iknowkungfu risk --range origin/main..HEAD --strict
- run: iknowkungfu verify --full
```
