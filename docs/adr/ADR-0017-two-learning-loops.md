# ADR-0017: Two learning loops — fast (per-task) and slow (periodic evolution)

Status: Accepted
Date: 2026-11-19
Milestone: M27–M35 (declared 0.7.0)

## Context

RESEARCH.md (M27–M35 §5) introduces two learning loops:

- **Fast loop (per-task)**: runs when a task or workflow completes.
  Collects evidence, normalizes outcome, identifies reusable knowledge,
  updates project-scoped memory. Does NOT change global Skills.
- **Slow loop (periodic)**: runs when enough evidence accumulates (e.g.,
  every 20 completed workflows, or when a recurring quality issue crosses
  a threshold). Generates improvement hypotheses, runs isolated
  experiments, produces PRs.

Running the full self-evolution process after every tool call would be
prohibitively expensive and would produce noisy, low-confidence updates.
Running it never means the kit cannot improve.

## Decision

The learning subsystem has **two distinct loops** with different triggers,
scopes, and autonomy levels.

### Fast loop — per-task (autonomy L0–L2)

```
Task Completed
  → Collect Evidence
  → Normalize Outcome
  → Identify Reusable Knowledge
  → Validate Scope and Confidence
  → Update Project Memory (L1, automatic under privacy rules)
  → Make Knowledge Available for next task
```

- Triggers: every workflow completion.
- Scope: project-local memory only.
- Autonomy: L0 (collect) + L1 (project memory) + L2 (lesson proposals,
  stored as candidates, not promoted).
- Output: `ExperienceEpisode` records + scoped `EngineeringMemory` updates
  - candidate `EngineeringLesson` records (confidence = "hypothesis").

### Slow loop — periodic evolution (autonomy L3–L5)

```
Accumulated Experiences (≥ threshold)
  → Pattern and Failure Analysis
  → Generate Improvement Hypotheses
  → Prioritize Proposals
  → Create Isolated Experiments (Evolution Lab)
  → Run Baseline and Candidate on held-out benchmarks
  → Evaluate Results (guardrails + metrics)
  → Improvement PR (L4, mandatory CI)
  → Human Approval (L5)
  → Release
```

- Triggers: every N completed workflows (N configurable, default 20), OR
  when a recurring quality issue crosses a configured threshold.
- Scope: global kit knowledge (Skills, stack packs, patterns, core code).
- Autonomy: L3 (candidate generation in isolated branch) + L4 (PR + CI) +
  L5 (human approval for merge).
- Output: `ImprovementHypothesis` → `ExperimentSpec` → `ComparisonReport` →
  `PromotionRequest` → PR → release.

### Frequency

The slow loop frequency is **evidence-driven, not time-driven**. RESEARCH.md
§5.2: "The frequency should be based on evidence and evaluation cost, not
an arbitrary schedule alone."

The default trigger is "every 20 completed workflows OR when 3+ independent
episodes identify the same recurring quality issue." Both thresholds are
configurable.

## Alternatives considered

- **One loop that does everything.** Rejected: too expensive per-task;
  too noisy; low-confidence updates pollute global knowledge.
- **Slow loop only.** Rejected: the kit cannot adapt within a single
  project (e.g., learning a repository's conventions) without per-task
  memory updates.
- **Fast loop only.** Rejected: the kit cannot improve its own Skills and
  patterns without periodic analysis and experimentation.
- **Time-driven slow loop (e.g., weekly).** Rejected: arbitrary; either
  fires too often (wasteful) or too rarely (misses evidence windows).

## Consequences

- `ExperienceEpisode` records are written by the fast loop after every
  workflow completion. The M13 observer produces these as a side effect
  of observing `turn.complete` and `session.end`.
- `EngineeringMemory` has two scopes: `project` (fast-loop writable at
  L1) and `global` (slow-loop only, requires L4+ to modify).
- `ImprovementHypothesis` records accumulate in the slow loop's inbox;
  the evolution engine prioritizes and experiments with them.
- The slow loop runs in the Evolution Lab (isolated branch, pinned
  baseline, held-out benchmarks). The lab is a separate workspace, not
  the production kit.
- The two loops share the `ExperienceEpisode` and `EngineeringLesson`
  contracts but use different autonomy levels (fast: L0–L2, slow: L3–L5).
- Meta-evolution (improving the learning mechanism itself) is M35 and
  uses the same slow-loop process with the same autonomy caps.

## References

- RESEARCH.md (M27–M35 §5, "Two learning loops: fast and slow")
- `packages/contracts/src/learning/experience-episode.ts`
- `packages/contracts/src/learning/engineering-memory.ts`
- `packages/contracts/src/evolution/improvement-hypothesis.ts`
- ADR-0016 (self-evolution engine as separate subsystem)
