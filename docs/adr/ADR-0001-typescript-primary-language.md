# ADR-0001: TypeScript as the primary language

Status: Accepted
Date: 2026-11-19
Milestone: M0 (frozen), implemented M1+

## Context

The kit needs a primary implementation language for its packages, scripts,
and contract surface. Candidates were TypeScript, Python, Go, and Rust.

The kit targets AI coding assistants (Claude Code first, others later) that
themselves consume TypeScript-typed contracts and emit TypeScript-typed
plugin manifests. The first stack packs are Node.js/TypeScript and
React/TypeScript; the Rails pack is added in M14 but the contract surface
still needs to type-check.

## Decision

TypeScript is the primary language for all packages in `packages/`,
deterministic scripts that benefit from typing, and the contract surface
zod schemas are derived from.

Stack packs MAY include non-TypeScript code (Ruby for Rails, Python, Go) —
those are reference material and templates, not first-class kit packages.

## Alternatives considered

- **Python.** Good for scripting and AI ecosystem, weaker for typed
  contracts at the boundary. Rejecting because the runtime adapters emit
  typed events and we want compile-time guarantees on the contract surface.
- **Go.** Strong typing and single-binary distribution, but the ecosystem
  for plugin manifests and zod-style runtime validation is weaker, and the
  first runtime (Claude Code) is Node-based.
- **Rust.** Best safety, but compile times and the learning curve slow down
  early milestones disproportionately to the safety gained before M10.

## Consequences

- The contracts package MUST compile under `strict: true` with
  `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`, and
  `noUnusedParameters` (`REQUIREMENTS.md` NFR-3).
- Runtime validation uses zod schemas that are structurally compatible with
  the exported TypeScript types (`CONTRACTS.md` §10).
- Stack packs for non-TS stacks ship their own language code as reference,
  but their manifest is typed against the contracts package.
- Adds a build step (TypeScript compiler) to CI. Acceptable: this is what
  gives us compile-time invariant enforcement.

## References

- `docs/requirements/REQUIREMENTS.md` §NFR-3
- `docs/architecture/ARCHITECTURE.md` §2
- `tsconfig.base.json`
