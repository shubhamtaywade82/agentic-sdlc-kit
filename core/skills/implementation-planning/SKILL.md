---
name: implementation-planning
description: Turn a validated specification into a dependency-aware vertical-slice task plan. Use when writing docs/plans, when breaking work into tasks, when ordering tasks by dependency, or before running kit validate-plan.
license: MIT
---

# Implementation Planning

A plan is a dependency graph of small, verifiable tasks — not a brainstorm and
not a diary. Output: `docs/plans/<slug>.md` (template `templates/PLAN.md`),
validated by `kit validate-plan`.

## Plan shape

- **Approach** — 3–6 sentences: the strategy, the first slice, and the riskiest
  part (do the risky part early).
- **Tasks** — `TASK-001`…, each with:
  - `Depends:` explicit predecessors (or `none`); unknown IDs and cycles fail
    validation.
  - `Acceptance:` what must be true when done — traceable to spec criteria.
  - `Verification:` how it is proven — the exact command or observation.
- **Checkpoints** — human/machine gates: design review before building on a new
  abstraction; test review before merge.

## Slicing rules (the hard part)

1. **Vertical, not horizontal.** A slice crosses layers to deliver one visible
   outcome (endpoint → logic → storage → test). "Build all models, then all
   controllers" is the anti-pattern.
2. **Working state after every task** where possible; if not, after every slice.
   Each task ends with `kit verify` green or explicitly says why not.
3. **Small enough to review**: one task ≈ one commit. If a task needs >15
   acceptance+verification items, split it (validator warns; treat it as a stop
   sign).
4. **Regression tasks are first-class**: pinning existing behavior that must not
   break is planned work, not an afterthought.
5. **Migrations backward-compatible and isolated** in their own task, sequenced
   so old and new code coexist.

## Dependency hygiene

- Dependencies = "cannot start until", not "relates to". When in doubt: no edge.
- Parallelizable chains stay parallel — don't serialize accidentally.
- Detect the critical path and schedule the riskiest dependency first.

## Validation (zero errors before building)

```bash
node .ai/kit/bin/kit.js validate-plan docs/plans/<slug>.md
```
The `/kit:feature` workflow must not proceed to implementation while plan
validation fails.

## Rules

- Never overwrite an incomplete plan from another task — new slug.
- Plans change: update the plan file as tasks complete or the approach adapts;
  keep the task IDs stable.
- Estimates in coarse units (S/M/L) at most; false precision is noise.
