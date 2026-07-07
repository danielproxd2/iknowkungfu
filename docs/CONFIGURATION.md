# Configuration & Artifacts

## `.iknowkungfu/config.json`

The only file you edit by hand. Every field is optional — an empty or absent config works.

```json
{
  "schemaVersion": 1,
  "clients": ["agents-md", "claude", "codex", "cursor", "copilot"],
  "excludes": ["vendored/**"],
  "riskAreas": [
    {
      "id": "payments",
      "paths": ["src/lib/payments/**"],
      "reason": "money movement",
      "rules": [{ "kind": "tests-first" }, { "kind": "max-files-per-change", "value": 3 }]
    }
  ],
  "diffLimits": { "warnFiles": 5, "warnLines": 150, "blockFiles": 15, "blockLines": 600 },
  "commandOverrides": [
    { "kind": "test", "command": "pnpm vitest run", "source": "team convention" }
  ],
  "mapMaxFiles": 20000
}
```

| Field | Default | Meaning |
|---|---|---|
| `clients` | all five | Which shims `init`/`adapt` write: `agents-md`, `claude`, `codex`, `cursor`, `copilot` |
| `excludes` | `[]` | Extra glob patterns to skip during scan (gitignore already applies) |
| `riskAreas` | `[]` | Paths that deserve extra care — see below. **The highest-value 30 seconds of setup.** |
| `diffLimits` | `5/150/15/600` | `risk` warns past `warnFiles`/`warnLines`, blocks past `blockFiles`/`blockLines` |
| `commandOverrides` | `[]` | Your commands replace detected ones of the same `kind` |
| `mapMaxFiles` | `20000` | Scan safety cap |

### Risk areas

Each area: `id`, `paths` (globs), `reason` (shown to agents), and optional `rules`:

| Rule | Effect in `risk` / `risk_check_diff` |
|---|---|
| `tests-first` | Touching the area without touching its tests is a blocker |
| `never-edit` | Any edit in the area is a blocker |
| `max-files-per-change` (`value`) | More than `value` files changed in the area is a blocker |
| `flag-in-report` | Not blocking — always surfaces the touch in the report |

Four risk areas are also inferred from directory names (auth, payments, crypto/secrets, migrations); inferred areas warn but never block, and a declared area always wins its `id`.

### Command overrides

`kind` is one of: `install`, `dev`, `build`, `test`, `test-file`, `test-e2e`, `lint`, `lint-fix`, `typecheck`, `format`, `migrate`, `custom`. `test-file` templates take `{file}`, e.g. `"pnpm vitest run {file}"`. `source` is free text explaining where the command comes from. Overrides get `provenance: "user"` — the highest trust level.

## Generated artifacts (don't edit inside blocks)

```
.iknowkungfu/
  manifest.json      # stack, tooling, command catalog — every fact provenance-tagged
  map.json           # file/dir roles, import graph, dependents, covering tests
  config.json        # yours (see above)
  docs/
    PROJECT_CONTEXT.md        # structure, entry points, exact commands
    AGENT_RUNBOOK.md          # the verify-before-and-after workflow
    TEST_ORACLE.md            # what tests exist, what covers what
    DEBUGGING_PLAYBOOKS.md    # stack-specific failure → action playbooks
    REFACTOR_GUARDRAILS.md    # invariants a refactor must not break
    PROMPTS.md                # ready-made task prompts wired to this repo
```

Plus the client shims at the repo root: `AGENTS.md`, `CLAUDE.md`, `.codex/skills/`, `.cursor/rules/`, `.github/copilot-instructions.md`.

### Marker blocks

Generated content lives inside marked regions:

```markdown
<!-- kungfu:begin id=identity inputs=80d612f60748 -->
...generated...
<!-- kungfu:end -->
```

`refresh` recomputes each block's `inputs` hash and rewrites only stale blocks. Anything you write *outside* the markers survives every refresh (test-enforced). Docs are also kept under hard line budgets so they stay cheap to load into a context window.

### Provenance

Untagged facts were parsed from your config files — trust them. Facts marked `⚠ inferred` are heuristic — verify before relying on them. Commands you override are `user` provenance and win over both.

## Committing

Commit `.iknowkungfu/` and the shims. Everything is deterministic text: scans are byte-for-byte reproducible, so diffs stay clean and reviews stay meaningful.
