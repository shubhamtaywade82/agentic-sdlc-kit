# ADR-0016: Self-evolution engine as a separate subsystem; never unrestricted

Status: Accepted
Date: 2026-11-19
Milestone: M27–M35 (declared 0.7.0; implemented from M27 onward)

## Context

RESEARCH.md (M27–M35 section) introduces a "Continuous Learning and
Self-Evolution Engine (CLSE)" that lets the kit learn from previous
engineering work, propose improvements to its own Skills/agents/Mods/
scripts/core, test those improvements in isolation, and integrate them
through the normal SDLC.

The critical distinction RESEARCH.md draws:

> The kit should be capable of improving itself, but it should not have
> unrestricted permission to modify and deploy itself.

And:

> The system that proposes an improvement must not be the only system
> that decides whether that improvement is correct.

This is a major architectural addition that touches every layer of the
kit. It must not be scattered across existing Skills and Mods.

## Decision

The self-evolution capability is a **separate subsystem** with two
packages and strict autonomy levels.

- `packages/contracts/src/learning/` — experience episodes, hierarchical
  memory (episodic / semantic / procedural / meta), engineering lessons.
- `packages/contracts/src/evolution/` — improvement hypotheses,
  experiment specs, comparison reports, promotion requests.
- `packages/contracts/src/evaluation/` — benchmark suites, metrics,
  evaluation reports, regression comparisons.

Future implementation milestones (M27–M35) add `packages/learning-core/`,
`packages/evolution-engine/`, and `packages/evaluation/` as runtime-
independent engines that consume these contracts.

**Autonomy levels (RESEARCH.md §8):**

| Level | Action                                                          | Authority                                |
| ----- | --------------------------------------------------------------- | ---------------------------------------- |
| L0    | Collect workflow evidence                                       | Automatic                                |
| L1    | Update project-local memory                                     | Automatic under configured privacy rules |
| L2    | Create reusable lesson proposals                                | Automatic                                |
| L3    | Generate Skill/template/stack-pack candidates                   | Automatic in isolated branch             |
| L4    | Modify scripts, policies, or core code                          | PR + mandatory CI                        |
| L5    | Merge changes to protected production branches                  | Human approval                           |
| L6    | Change security controls, identity boundaries, or model weights | Explicit elevated human authorization    |

These are enforced by the evolution engine's promotion gate, not by
trust in the improvement generator.

**Non-negotiable invariants:**

1. The evolution engine MUST NOT weaken evaluation controls to make
   itself appear successful. (RESEARCH.md §8: "The evolution engine must
   never be allowed to weaken evaluation controls to make itself appear
   successful.")
2. Benchmark definitions are protected (immutable historical records).
3. Promotion to production requires human approval (L5).
4. Changes to security controls require elevated authorization (L6).
5. The system that proposes an improvement is not the system that decides
   whether it is correct.

## Alternatives considered

- **Embed learning logic in existing Skills/Mods.** Rejected: scatters
  the capability; no consistent autonomy enforcement; impossible to audit.
- **Allow the evolution engine to merge its own PRs.** Rejected: violates
  the "proposer is not the approver" principle; a model that improves its
  own test could weaken it to appear successful.
- **Wait until M27 to declare the contracts.** Rejected: the contracts
  are referenced by the M19 evaluation framework and by the M13 observer
  (which produces the experience episodes the engine consumes). Declaring
  them now keeps M19 and M13 from refactoring later.
- **Train the foundation model as part of self-evolution.** Rejected:
  RESEARCH.md §1 explicitly defers this ("keeping the underlying
  foundation model unchanged and allowing the kit to evolve its
  surrounding engineering infrastructure"). Model training is a future
  research direction, not an M27–M35 deliverable.

## Consequences

- The kit has two major systems: System A (Software Engineering Engine)
  and System B (Learning and Evolution Engine). System B improves System A
  through controlled updates.
- `packages/contracts/src/learning/`, `.../evolution/`, `.../evaluation/`
  ship in 0.7.0 as contract surfaces.
- The M19 evaluation framework and the M13 observer are designed to feed
  the learning engine from the start (they produce `ExperienceEpisode` and
  `MetricSnapshot` records).
- The evolution engine (when it ships in M27+) uses the same SDLC process
  the kit applies to external repositories: it opens PRs, runs CI, requires
  review, and supports rollback.
- The capability manifest (ADR-0014) is extended with a `learningScope`
  field so a Mod can declare whether it contributes to learning (and at
  what autonomy level).

## References

- RESEARCH.md (M27–M35 section, "Continuous Learning and Self-Evolution Engine")
- `packages/contracts/src/learning/`
- `packages/contracts/src/evolution/`
- `packages/contracts/src/evaluation/`
- ADR-0014 (Mod SDK as runtime adapter)
- ADR-0011 (shared security contracts before Mods)
