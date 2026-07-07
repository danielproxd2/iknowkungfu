# Contributing

## Dev loop

```bash
pnpm install
pnpm test        # builds the CLI bundle, then runs all tests (unit + built-binary integration)
pnpm typecheck   # single tsc pass over all packages
```

Node ≥ 20, pnpm ≥ 11. CI runs {ubuntu, macos, windows} × node {20, 22} plus a pack-smoke test
(`node scripts/pack-smoke.mjs`) that installs the packed tarball into a bare directory and runs
`init` on both fixture stacks.

## Layout

- `packages/schemas` — zod schemas; the data contract. Everything persisted is validated.
- `packages/core` — all deterministic logic (detection, graph, artifacts, verify, risk). **Core never writes files.**
- `packages/cli` — commander CLI; owns every filesystem write through `writeManaged` (allow-listed paths only). The only published package; bundles the others.
- `packages/mcp` — MCP server; thin wrappers over core + the precomputed `.iknowkungfu/` files.
- `packages/adapters` — one small module per client shim.
- `fixtures/` — miniature real repos the tests run against.

## Good first contributions

1. **A language detector** (`core/src/detect/`): add a fixture repo, write the test asserting the expected `CommandCatalog`, implement the detector. Every fact needs `provenance` + `source`.
2. **A risk rule** (`core/src/risk/engine.ts`): pure function `(input) → RiskFinding[]`, one fixture diff test per rule. Findings need a concrete `suggestion` — the literal next action.
3. **A client adapter** (`packages/adapters`): ≤30 lines of shim content, snapshot + idempotence tests.

## Non-negotiables (enforced by tests — don't delete them)

- Determinism: same repo state → byte-identical scan output.
- User code is never modified: writes only inside the managed-path allowlist and `rh:` marker blocks; user text outside blocks survives refresh.
- Generated docs stay under their line budgets.
- Verdicts come from exit codes; reporter parsers are best-effort garnish.
