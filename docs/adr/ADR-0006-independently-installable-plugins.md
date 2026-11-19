# ADR-0006: Independently installable plugins; vertical slices, not one-shot generation

Status: Accepted
Date: 2026-11-19
Milestone: M0 (frozen), implemented incrementally from M3

## Context

Two related decisions are frozen together because they share a rationale:

1. **Plugin model.** The kit ships many modules (skills, agents, commands,
   Mods, stack packs, patterns). Should they be one monolithic install or
   independently installable plugins?
2. **Generation strategy.** When the kit builds a feature or a new
   application, should the AI generate the entire thing in one pass, or
   should the kit force vertical slices?

Both decisions are about **avoiding uncontrolled scope**: the first at the
kit-installation level, the second at the workflow-execution level.

## Decision

### Plugin model

Every module type (skill, agent, command, Mod, stack pack, pattern) is an
**independently installable plugin**. An installer profile (M15) selects
which plugins to install in a given repository. Installation is idempotent,
ownership-tracked, and safely uninstallable.

### Generation strategy

The kit **never** asks the AI to generate an entire production application
or an entire feature in one pass. Every workflow (`/kit:feature`,
`/kit:app`, `/kit:fix`, `/kit:refactor`) operates in **vertical slices**:

- Establish the foundation.
- Implement one end-to-end slice.
- Verify and review the slice.
- Implement the next slice.
- Repeat until the planned scope is satisfied.

A "slice" is a task whose dependencies are satisfied, whose acceptance
criteria are explicit, and whose verification procedure is configured. A
task without a verification procedure is not a slice; it is uncontrolled
scope.

## Alternatives considered

- **Monolithic install.** Simpler installer, but every repository gets
  every Mod, every stack pack, and every skill whether it needs them or
  not. Rejected: it bloats agent context and makes uninstall unsafe.
- **One-shot generation.** Faster demo, but: (a) the AI cannot reliably
  verify a one-shot generation; (b) regression risk is unbounded; (c) the
  diff is unreviewable; (d) the failure mode is "start over". Rejected.
- **Horizontal slices (database, then backend, then frontend).** Each layer
  looks done in isolation but the vertical behavior is never proven until
  the end. Rejected: `WORKFLOWS.md` §6 and §7 explicitly call for vertical
  slices.

## Consequences

- The M15 installer supports profiles (`minimal`, `full-sdlc`, `runtime`,
  `stack-specific`) and tracks ownership in `.ai-kit/manifest` so uninstall
  removes only kit-owned files.
- The workflow engine in `core` (M5+) enforces "one slice at a time" by
  selecting the next task whose dependencies are satisfied. There is no
  "execute all tasks" code path.
- Each slice persists its own evidence (test results, affected files,
  verification report) under `docs/plans/<featureId>/` and
  `.ai-kit/reports/`.
- A slice that fails verification blocks the workflow (`blocked` state in
  the `WorkflowStatus` machine). The user decides whether to revise the
  slice or stop.
- This decision is reflected in `PRODUCT.md` §4 (non-goals: "not a one-shot
  generate-the-entire-app tool") and in every workflow description in
  `WORKFLOWS.md`.

## References

- `docs/product/PRODUCT.md` §4, §6
- `docs/workflows/WORKFLOWS.md` §5, §6, §9
- `docs/modules/MODULES.md` §9
- `docs/roadmap/ROADMAP.md` §17 (M15)
