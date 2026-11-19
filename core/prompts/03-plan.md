# Prompt: Spec → Task Plan

Read docs/specifications/features/<slug>.md. Create docs/plans/<slug>.md using templates/PLAN.md.
Rules:
- Tasks are vertical slices: one complete outcome each, ordered by dependency, one commit each.
- Each task has a unique TASK-### id, Depends: list, Acceptance criteria, and a Verification command.
- Regression tasks for existing behavior are first-class plan items.
- Mark tasks that can be done in parallel with [P].
- End with an integration/e2e task and a docs task.
Validate: `node .ai/kit/bin/kit.js validate-plan docs/plans/<slug>.md` — fix every error.
Show me the plan and wait for approval.
