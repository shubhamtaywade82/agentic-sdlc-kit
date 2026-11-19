# ADR-0010: One implementation engine, many workflow entry points

Status: Accepted
Date: 2026-11-19
Milestone: M8 (frozen), implemented from M8 onward

## Context

The kit ships multiple top-level workflows: `/kit:feature` (M7),
`/kit:app` (M8), `/kit:fix` and `/kit:refactor` (M9). The temptation is to
build a separate implementation engine per workflow — one for features, one
for greenfield apps, one for bug fixes, one for refactors.

Per `docs/product/PRODUCT.md` §4 ("not a general-purpose AI agent") and the
post-M7 roadmap (§19 "Separate app and feature implementation engines →
Duplicated behavior and maintenance"), separate engines multiply the
maintenance surface and let behavior drift between workflows.

## Decision

There is **one implementation engine** in `core`. Different workflows are
different **entry points** that drive the same engine through different
state machines and stage orderings.

- `packages/core/src/workflows/feature/` (M7) — feature workflow state machine.
- `packages/core/src/workflows/application/` (M8) — greenfield app state machine.
- `packages/core/src/workflows/bug-fix/` (M9) — bug-fix state machine.
- `packages/core/src/workflows/refactor/` (M9) — refactor state machine.

All four reuse:

- `contracts/specification` for requirements.
- `contracts/planning` for tasks and dependency graphs.
- `contracts/verification` for verification reports.
- `core/workflows/engine.ts` helpers (`canTransition`, `isTerminal`).
- `core/policy/evaluator.ts` for approval gates.
- `core/artifacts/writer.ts` for safe persistence.

The differences between workflows are:

1. The set of stages they traverse.
2. The transitions allowed between those stages.
3. The workflow-specific context (e.g., bug-fix carries a BugReport;
   refactor carries a RefactorContract).

## Alternatives considered

- **One engine per workflow.** Rejected: drifts, multiplies tests, breaks
  the shared Definition of Done.
- **One generic workflow with mode flags.** Rejected: a single state
  machine cannot encode the genuinely different lifecycles (e.g., bug-fix
  requires reproduction before root cause; refactor requires
  characterization tests before structural change). Mode flags would
  produce a state machine that is correct for none of them.
- **Engines as separate packages.** Rejected: they share too much
  (contracts, policy, artifacts) to live in separate packages without
  re-importing the world.

## Consequences

- Each workflow has its own state machine file in `core/workflows/<name>/`.
- Each workflow exports its own `createXState`, `transition`, `canTransition`.
- The shared `WorkflowEngine` helpers in `core/workflows/engine.ts` are
  reused; workflows do NOT subclass or wrap it.
- Adding a new workflow (e.g., `/kit:optimize` in M9-optional) is a new
  directory under `core/workflows/`, not a modification to existing ones.
- Workflow-specific context types live in `contracts/<domain>/` so they can
  be validated independently.

## References

- `docs/workflows/WORKFLOWS.md` §1, §8
- Post-M7 roadmap §2.2 ("reuse the existing M3–M6 workflow engine instead
  of building a separate greenfield implementation engine")
- `packages/core/src/workflows/application/`
- `packages/core/src/workflows/bug-fix/`
- `packages/core/src/workflows/refactor/`
