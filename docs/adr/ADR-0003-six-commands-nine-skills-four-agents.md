# ADR-0003: Six commands, nine skills, four agents

Date: 2026-11-19 · Status: accepted

## Context

v4 shipped 7 commands, 4 skills + 2 pattern packs, 7 agents. The proposal
(§5–§6) argues for the smallest public interface that covers the lifecycle:
commands are workflow entry points, not shell wrappers; skills load on
demand; agents are delegated to only when work is independent.

## Decision

- **Six commands**: `/kit:init`, `/kit:app`, `/kit:feature`, `/kit:fix`,
  `/kit:review`, `/kit:release` (Claude Code namespace via
  `.claude/commands/kit/`; other adapters get flat equivalents).
- **Nine skills** (agentskills.io format): repo-discovery,
  requirements-engineering, system-design, implementation-planning, tdd-bdd,
  design-pattern-selection, code-quality, security-engineering,
  release-engineering. Pattern catalogs move OUT of skills into stack packs.
- **Four agents**: repository-analyst, architecture-reviewer, code-reviewer,
  security-reviewer — all read-only analysis roles. Implementation is the
  primary agent's job.

## Consequences

- (+) Map (v4): /feature→/kit:feature, /plan+/tdd absorbed into the feature
  workflow + tdd-bdd skill, /debug+/refactor→/kit:fix, /review→/kit:review,
  /ship→/kit:release; planner/implementer/tester content lives in
  skills+workflows; debugger→workflow 06.
- (+) Every command orchestrates skills + gates instead of duplicating
  instructions; context cost stays low (small index, on-demand knowledge).
- (−) /plan and /tdd power users lose standalone entry points; the workflow
  covers their use cases and `kit validate-*` are plain commands anyway.
