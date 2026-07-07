# Demo: the full loop, end to end

Every output below is real, captured by running the built binary against `fixtures/exec-node`
(a minimal repo whose catalog commands actually execute). Reproduce with the same steps.

## 1. `iknowkungfu init --yes`

```
iknowkungfu v1.1.0 — init
✔ Detected: vitest@2.0.0 · JavaScript 100% · node
✔ Command catalog: 4 detected, 1 inferred
✔ Mapped 6 files · 3 entrypoints
⚠ 3 core file(s) without tests

  written: .iknowkungfu/manifest.json
  written: .iknowkungfu/map.json
  written: .iknowkungfu/docs/PROJECT_CONTEXT.md
  written: .iknowkungfu/docs/AGENT_RUNBOOK.md
  written: .iknowkungfu/docs/TEST_ORACLE.md
  written: .iknowkungfu/docs/DEBUGGING_PLAYBOOKS.md
  written: .iknowkungfu/docs/REFACTOR_GUARDRAILS.md
  written: .iknowkungfu/docs/PROMPTS.md
  written: AGENTS.md
  written: CLAUDE.md
  written: .codex/skills/iknowkungfu/SKILL.md
  written: .cursor/rules/iknowkungfu.mdc
  written: .github/copilot-instructions.md

Claude Code MCP: merge into .mcp.json → {"mcpServers":{"iknowkungfu":{"command":"iknowkungfu","args":["mcp"]}}}
```

## 2. `iknowkungfu verify --baseline` — green tree confirmed

```
verify (baseline): PASS in 378ms
  pass      npm run typecheck (132ms)
  pass      npm run lint (123ms)
  pass      npm test (123ms)
```

## 3. Break `add()` (`return a - b`) → `iknowkungfu verify --changed` catches it

The verify plan scopes to the covering test found via the import graph — not the whole suite:

```
verify (changed): FAIL in 372ms
  pass      npm run typecheck (125ms)
  pass      npm run lint (123ms)
  fail      npm test -- tests/calc.test.mjs (124ms)
    ✗ tests/calc.test.mjs > add — AssertionError: expected add(2, 3) to be 5, got -1
exit=1
```

## 4. Delete a test + add a debug statement, stage → `iknowkungfu risk --staged`

```
risk (staged): BLOCKED — 2 files, +1/-2

SEVERITY  RULE             FILE                 MESSAGE
blocker   test-deleted     tests/calc.test.mjs  Test file deleted
warning   debug-statement  src/calc.mjs         Added a debug statement (console.log/debugger/print)

  → Restore it and fix the source instead — or justify the deletion explicitly in your report.
  → Remove it or replace it with the project's logger.
exit=1
```

## 5. Add a `format` script to package.json → `iknowkungfu refresh`

`refresh --check` exits 1 (CI-detectable staleness). `refresh` rewrites only the stale blocks:

```
refreshed: .iknowkungfu/manifest.json
refreshed: .iknowkungfu/map.json
refreshed: .iknowkungfu/docs/PROJECT_CONTEXT.md [commands, entrypoints]
```

The other five docs are byte-untouched. `git diff --stat`:

```
 .iknowkungfu/docs/PROJECT_CONTEXT.md |  6 ++++--
 .iknowkungfu/manifest.json           | 14 ++++++++++----
 .iknowkungfu/map.json                | 11 ++++++++++-
```

And the doc diff is exactly the new catalog row (plus the new script entrypoint):

```diff
-<!-- kungfu:begin id=commands inputs=f341eac27318 -->
+<!-- kungfu:begin id=commands inputs=fe1e60793d4d -->
 ...
 | typecheck | `npm run typecheck` |  |
+| format | `npm run format` |  |
 | test-file | `npm test -- {file}` | ⚠ inferred |
```

User text added outside `rh:` marker blocks survives every refresh (covered by tests).
