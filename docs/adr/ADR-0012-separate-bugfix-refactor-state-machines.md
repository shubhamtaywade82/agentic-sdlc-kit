# ADR-0012: Separate bug-fix and refactoring state machines; do not merge

Status: Accepted
Date: 2026-11-19
Milestone: M9 (frozen), implemented from M9 onward

## Context

The post-M7 roadmap §3 ships two workflows under M9: `/kit:fix` and
`/kit:refactor`. Both are "maintenance" work on an existing repository,
which makes it tempting to ship them as one generic `/kit:maintain`
workflow with mode flags.

The roadmap explicitly forbids this (§3: "M9 should deliver two distinct
workflows. Do not merge them into one generic maintenance command.") and
for good reason: their lifecycles are genuinely different.

- **Bug fix**: report → discovery → **reproduction** → **root cause** →
  **regression test** → **minimal fix** → focused verification → regression
  verification → review → completion.
- **Refactor**: contract → discover deps → **characterization tests** →
  **target structure** → identify patterns → **incremental refactoring** →
  **public-contract validation** → regression testing → quality comparison
  → review.

The bolded stages are not shared. A bug fix must not modify public
behavior; a refactor must not change behavior at all. A bug fix's test is
a regression test that fails before the fix; a refactor's tests are
characterization tests that pass before and after. Mixing the two would
produce a state machine that is correct for neither.

## Decision

`/kit:fix` and `/kit:refactor` are **two separate workflows** with their
own state machines, contexts, and stage sets.

- `packages/contracts/src/maintenance/bug-report.ts` — bug report contract.
- `packages/contracts/src/maintenance/bug-fix-workflow.ts` — bug-fix
  state, transitions, context.
- `packages/contracts/src/maintenance/refactor-contract.ts` — refactor
  contract.
- `packages/contracts/src/maintenance/refactor-workflow.ts` — refactor
  state, transitions, context.
- `packages/contracts/src/maintenance/performance-baseline.ts` — M9
  optional `/kit:optimize` contract.
- `packages/core/src/workflows/bug-fix/` — bug-fix state machine + stages.
- `packages/core/src/workflows/refactor/` — refactor state machine + stages.

Both reuse:

- `contracts/specification` (where applicable — refactor may not need a
  full feature spec).
- `contracts/planning` for task graphs.
- `contracts/verification` for reports.
- `core/policy/evaluator.ts` for approvals.
- `core/artifacts/writer.ts` for persistence.

## Alternatives considered

- **One `/kit:maintain` workflow with mode flags.** Rejected (above).
- **Three workflows including `/kit:optimize`.** The roadmap makes
  `/kit:optimize` an "optional M9 extension" (§3.3). We declare its
  contract surface in 0.6.0 (`performance-baseline.ts`) but do not ship a
  full state machine; that lands in a later release if the optimization
  workflow is prioritized.
- **Merge bug-fix into `/kit:feature`.** Rejected: a bug fix has a
  reproduction step that a feature does not, and a feature has a spec
  generation step that a bug fix usually does not need.

## Consequences

- Two state machines, two sets of stages, two context types.
- The bug-fix state machine enforces "regression test exists before fix is
  applied" — this is an invariant, not a convention.
- The refactor state machine enforces "characterization tests exist before
  structural change" — also an invariant.
- Both state machines share the terminal-states invariant from
  `core/workflows/engine.ts`: `completed` and `failed` cannot transition
  out without a new run.
- `/kit:optimize` contract is declared but not wired to a state machine in
  0.6.0.

## References

- Post-M7 roadmap §3 (M9), §3.1 (bug-fix), §3.2 (refactor), §3.3 (optimize)
- `docs/workflows/WORKFLOWS.md` §6, §7
- `packages/contracts/src/maintenance/`
- `packages/core/src/workflows/bug-fix/`
- `packages/core/src/workflows/refactor/`
