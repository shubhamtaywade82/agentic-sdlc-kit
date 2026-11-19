# 03 — Task Plan

**Goal:** A checklist of small, ordered, independently verifiable tasks.

Rules for tasks
- Vertical slices, not layers: a task delivers one complete outcome (endpoint →
  logic → storage → test), leaving the app working.
- Each task: one commit, unique `TASK-###` id, `Depends:` list, acceptance,
  verification command, own test(s).
- Order: risky/uncertain first; regression tasks for existing behavior are
  first-class plan items; migrations isolated and backward-compatible.
- Mark tasks that can run in parallel (for multi-agent setups).

Save as `docs/plans/<slug>.md` using `templates/PLAN.md`. The plan is the agent's memory —
update it as tasks complete so any new session can resume. Never overwrite another
task's incomplete plan.

Prompt: `prompts/03-plan.md` · Skill: `implementation-planning`
Exit gate: `node .ai/kit/bin/kit.js validate-plan docs/plans/<slug>.md` — zero errors
(no cycles, no dangling dependencies, every task has acceptance + verification).
