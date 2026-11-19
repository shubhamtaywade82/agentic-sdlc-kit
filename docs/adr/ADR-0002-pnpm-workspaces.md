# ADR-0002: pnpm workspaces for the monorepo

Status: Accepted
Date: 2026-11-19
Milestone: M0 (frozen), implemented M1-01

## Context

The kit is a modular monorepo (ADR-0003) with five packages in M1 and more
in later milestones. We need a package manager that supports workspaces,
handles peer dependencies correctly, and produces a deterministic lockfile.

Candidates: pnpm, npm workspaces, yarn (classic and berry), Bun.

## Decision

Use **pnpm workspaces** with a committed `pnpm-lock.yaml`. Pin
`packageManager: pnpm@9.12.0` in the root `package.json`. CI uses
`pnpm install --frozen-lockfile`.

## Alternatives considered

- **npm workspaces.** Built-in, no extra tooling. Slower install, weaker
  peer-dependency handling, and historically worse at detecting phantom
  dependencies. Acceptable but not optimal.
- **Yarn classic.** No longer the right default; no workspaces protocol
  improvements in years.
- **Yarn berry.** Powerful but its PnP model complicates IDE integration
  and stack-pack authoring for contributors who expect node_modules.
- **Bun.** Fast, but ecosystem maturity for plugins and lockfile stability
  are not where we need them for a 1.0 release target.

## Consequences

- `packageManager` field pins the exact pnpm version; contributors use
  `corepack` to get it automatically.
- `pnpm-workspace.yaml` declares `packages/*` and `fixtures/*`.
- Strict peer dependencies disabled in `.npmrc` to avoid false positives
  during early milestones; re-evaluated at M16.
- The lockfile is committed and CI uses `--frozen-lockfile`.
- Cross-package imports go through the workspace package name
  (`@agentic-sdlc-kit/contracts`), never through `dist/` paths.

## References

- `package.json` (`packageManager`, `workspaces`)
- `pnpm-workspace.yaml`
- `.npmrc`
- `docs/security/SECURITY.md` §6 (CI supply-chain baseline)
