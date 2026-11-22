# Contributing to the Agentic SDLC Kit

Thank you for considering a contribution. The kit is at release 0.1 (M0 +
M1); the roadmap in `docs/roadmap/ROADMAP.md` describes later milestones.

## Before you start

Open an issue for anything beyond a typo or a docs fix. We use issues to
agree on scope before code is written — this is especially important for
contract changes, which require an ADR.

## Development setup

```bash
git clone <this repo>
cd agentic-sdlc-kit
corepack enable          # picks up pnpm from package.json
pnpm install --frozen-lockfile
pnpm verify
```

Requirements: Node 20+ and pnpm 12.21.0.

## The verify pipeline

`pnpm verify` runs, in order:

1. `pnpm run check:architecture` — enforces the dependency invariants
   (`docs/architecture/ARCHITECTURE.md` §6). Fails if any package imports
   outside its allow-list.
2. `pnpm run typecheck` — `tsc --noEmit` for every workspace package.
3. `pnpm run lint` — ESLint on the whole tree.
4. `pnpm run test` — Vitest for every workspace package.
5. `pnpm run build` — `tsc` emit for every workspace package.

A PR is mergeable only when `pnpm verify` is green on Node 20 and Node 22,
Ubuntu and macOS. CI runs the same matrix.

## Architectural invariants (read this before editing imports)

These are enforced by `scripts/check-architecture.ts` and are
non-negotiable for 0.1:

1. `contracts` imports nothing from sibling packages.
2. `core` imports only from `contracts`. **No host runtime SDK import
   inside `core` — ever.** This is what keeps the core runtime-independent
   (ADR-0004).
3. `cli` imports from `core` and `contracts`.
4. `testing` imports from `contracts` and dev-only deps.
5. `claude-code-adapter` imports from `contracts`; the host SDK import (in
   M10+) lives inside this package only.
6. No package imports from a sibling's `dist/`.

If your change requires violating any of these, open an issue and propose
an ADR first. The CI gate will fail otherwise.

## Adding a CLI command

1. Create `packages/cli/src/commands/<name>.ts` exporting a `Command`.
2. Register it in `packages/cli/src/application/dispatcher.ts`.
3. Add a test in `packages/cli/src/commands/<name>.test.ts`.

The dispatcher is the only place that knows the full command list. Adding
a command is one file plus one registry entry.

## Changing a contract

Every public type in `packages/contracts/src/` is part of the contract
surface. Changes require:

1. An ADR under `docs/adr/` describing the change, alternatives considered,
   and migration path.
2. A `schemaVersion` bump if the contract is persisted
   (`ProjectProfile`, `WorkflowState`, `VerificationReport`,
   `ImplementationPlan`).
3. A migration function in `packages/core/src/artifacts/migrations/` if
   breaking.
4. Updated tests in `packages/testing/src/validators/`.

## Adding a package

1. Create `packages/<name>/` with `package.json`, `tsconfig.json`,
   `vitest.config.ts`, `src/`, and a `README.md`.
2. Add it to `scripts/check-architecture.ts` with its allowed imports.
3. Add a workspace reference if other packages need to depend on it.
4. Add a smoke test to `packages/testing/src/index.test.ts` (or similar)
   that imports the new barrel.

## Commit and PR style

- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
  `chore:`).
- One logical change per PR. Contract changes get their own PR.
- Include the ADR number in the commit message when relevant
  (`feat(contracts): bump ProjectProfile schemaVersion to 2 (ADR-0010)`).

## CI

`.github/workflows/ci.yml` runs `pnpm verify` on a matrix of
`{ubuntu-latest, macos-latest} × {Node 20, Node 22}`, plus a `shellcheck`
job for any shell scripts. GitHub Actions are pinned to full SHAs
(`docs/security/SECURITY.md` §6).

## Releasing

0.1 has no release automation yet (M16 adds it). The release flow for 0.1
is:

1. `pnpm verify` green on the matrix.
2. Update `packages/cli/src/application/version.ts` and root
   `package.json` `version`.
3. Tag `v0.1.0`.
4. Publish workspace packages with `pnpm -r publish`.

## License

By contributing, you agree that your contributions are licensed under the
MIT License (see `LICENSE`).
