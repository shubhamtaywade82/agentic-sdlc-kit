# ADR-0003: Modular monorepo architecture

Status: Accepted
Date: 2026-11-19
Milestone: M0 (frozen), implemented M1-01

## Context

The kit has many concerns: contracts, core engine, CLI, testing utilities,
runtime adapters, plugins (Mods, skills, agents), stack packs, patterns,
fixtures. We need to decide between a single package, a polyrepo of separate
repositories, and a monorepo.

## Decision

Adopt a **modular monorepo**: one repository, multiple workspace packages
with strict dependency rules, plus directories for plugins, stack packs,
patterns, fixtures, and docs.

The dependency rules are invariants (`ARCHITECTURE.md` §6):

1. `contracts` imports nothing.
2. `core` imports only from `contracts`.
3. `cli` imports from `core` and `contracts`.
4. `testing` imports from `contracts` and dev-only deps.
5. `claude-code-adapter` imports from `contracts`; the host SDK import lives
   inside this package only.
6. No package imports from a sibling's `dist/`.

These invariants are enforced by `scripts/check-architecture.ts` in CI.

## Alternatives considered

- **Single package.** Simplest, but loses the ability to version, publish,
  and consume packages independently. Also makes the "no Claude Code APIs in
  core" invariant hard to enforce because everything is in one module
  graph.
- **Polyrepo.** Maximum independence, but the cost of cross-repo changes
  (e.g., updating a contract and all consumers) is high in early
  milestones when contracts change frequently. Re-evaluate at M18.
- **Monorepo without strict invariants.** Invites circular dependencies and
  the "everything imports everything" failure mode. Rejected.

## Consequences

- Every package has its own `package.json` and `tsconfig.json` extending
  `tsconfig.base.json`.
- The root `package.json` exposes aggregate scripts (`build`, `typecheck`,
  `lint`, `test`, `verify`) that iterate over the workspace.
- A new package is added by creating a directory under `packages/`, adding
  it to `pnpm-workspace.yaml` (already covered by `packages/*` glob), and
  registering it in `scripts/check-architecture.ts` if it has new
  dependency rules.
- Cross-package changes are atomic in a single PR, which is what we want
  while contracts evolve.

## References

- `docs/architecture/ARCHITECTURE.md` §1, §6
- `docs/modules/MODULES.md` §2, §10
- `pnpm-workspace.yaml`
- `scripts/check-architecture.ts`
