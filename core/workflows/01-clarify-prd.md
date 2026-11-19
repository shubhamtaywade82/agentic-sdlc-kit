# 01 — Clarify & PRD

**Goal:** Turn a vague idea into testable acceptance criteria before any code.

Steps
1. Give the AI the idea + relevant context (users, constraints, existing features).
2. AI asks ≤ 5 clarifying questions (users, scope, edge cases, non-goals, success metric).
3. AI drafts `docs/product/<slug>.md` (PRD) from `templates/PRD.md`.
4. You edit/approve. Acceptance criteria use Given/When/Then.

Prompt: `prompts/01-clarify.md` · Skill: `requirements-engineering`

Exit gate: every acceptance criterion is observable and testable; non-goals listed;
feature specs pass `kit validate-spec` (`node .ai/kit/bin/kit.js validate-spec <file>`).
