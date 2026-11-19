# Agentic SDLC Kit

A **runtime-independent** Agentic SDLC kit: a structured SDLC system that
lets an AI coding assistant take a feature, bug fix, refactor, or new
application from an ambiguous request to a verified, reviewable change —
without giving up the engineering discipline a human team would apply.

This repository implements the **0.1 release (M0 + M1)** of the roadmap in
[`docs/roadmap/ROADMAP.md`](docs/roadmap/ROADMAP.md). Later milestones (M2
through M18) are described there as planning labels.

## What is in 0.1

- **M0 — Architecture freeze** (10 docs + 9 ADRs) under `docs/`.
- **M1 — Core platform foundation** as a TypeScript pnpm-workspace monorepo:
  - `packages/contracts` — shared types and zod schemas. Depends on nothing.
  - `packages/core` — runtime-independent workflow engine, profile generator
    and validator, artifacts writer, policy evaluator, verification runner.
  - `packages/cli` — the `kit` executable with `--version`, `--help`, and
    `doctor`.
  - `packages/testing` — shared fixtures, assertions, validators, helpers.
  - `packages/claude-code-adapter` — the architectural boundary that
    separates the host runtime from the runtime-independent core. **M1
    ships the boundary declaration only**; the host SDK is not imported
    until M10 (see ADR-0005).
- **Baseline CI** under `.github/workflows/ci.yml`.
- **Architecture check** under `scripts/check-architecture.ts`, wired into
  `pnpm verify` and CI.
- **Reference fixture** under `fixtures/fixture-node-fullstack/` for the
  first M2 `kit inspect` dry-run.

## Quick start

```bash
# Install (uses the committed pnpm-lock.yaml)
pnpm install --frozen-lockfile

# Run the full pipeline (architecture → typecheck → lint → test → build)
pnpm verify

# Smoke the CLI
node packages/cli/dist/index.js --version
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js doctor
```

Requirements: Node 20+ and pnpm 9.12.0. The `packageManager` field in
`package.json` pins pnpm; `corepack enable` picks it up automatically.

## Architectural invariants

These are enforced by `scripts/check-architecture.ts`, which runs in CI
before `pnpm verify` and fails the build on any violation
(see `docs/architecture/ARCHITECTURE.md` §6):

1. `contracts` imports nothing.
2. `core` imports only from `contracts`.
3. `cli` imports from `core` and `contracts`.
4. `testing` imports from `contracts` and dev-only deps.
5. `claude-code-adapter` imports from `contracts`; the host SDK import
   lives inside this package only.
6. No package imports from a sibling's `dist/`.

The single most important invariant: **the core is runtime-independent.**
The Claude Code adapter is one adapter among many possible adapters, never
the owner of the product's workflow logic. See ADR-0004 and ADR-0005.

## Documentation

The full M0 artifact set lives under `docs/`:

- [`docs/product/PRODUCT.md`](docs/product/PRODUCT.md) — vision, users, non-goals.
- [`docs/requirements/REQUIREMENTS.md`](docs/requirements/REQUIREMENTS.md) — FRs and NFRs for 0.1.
- [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) — boundaries, components, invariants.
- [`docs/modules/MODULES.md`](docs/modules/MODULES.md) — packages, skills, agents, commands, Mods, stack packs.
- [`docs/workflows/WORKFLOWS.md`](docs/workflows/WORKFLOWS.md) — feature, app, fix, refactor lifecycles.
- [`docs/contracts/CONTRACTS.md`](docs/contracts/CONTRACTS.md) — types and zod schemas.
- [`docs/security/SECURITY.md`](docs/security/SECURITY.md) — threat model, approval rules, the "not an OS sandbox" limitation.
- [`docs/testing/TESTING.md`](docs/testing/TESTING.md) — test strategy and Definition of Done.
- [`docs/roadmap/ROADMAP.md`](docs/roadmap/ROADMAP.md) — milestones M0–M18, release gates.
- [`docs/adr/`](docs/adr/) — nine Architecture Decision Records.

## The non-negotiable limitation

Claude Code Mods (and equivalent host-runtime plugins) execute with the
host process's access to the machine. They are **not** an operating-system
sandbox. The kit provides approval controls, policy evaluation, secret
redaction, and observability — but real isolation must come from OS
permissions, containers, restricted credentials, and deployment controls.
See [`docs/security/SECURITY.md`](docs/security/SECURITY.md) §4 and
ADR-0009.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). In short: open an issue first for
anything beyond a typo; every code change runs `pnpm verify` green on Node
20 and Node 22, Ubuntu and macOS; every contract change requires an ADR.

## License

MIT. See [`LICENSE`](LICENSE).
