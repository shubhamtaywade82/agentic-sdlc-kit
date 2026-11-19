# 05 — Review

Use a **fresh context** (`/kit:review`) so the reviewer isn't biased by the author's reasoning.

1. Frame: `node .ai/kit/bin/kit.js changed`; diff vs base. Reviewer reads spec + plan first.
2. `code-reviewer` agent (correctness, regressions, tests) — findings ranked
   **Blocker / Major / Minor / Nit**, each with file:line and a suggested fix.
3. `architecture-reviewer` agent when structure/abstractions shift;
   `security-reviewer` agent + `node .ai/kit/bin/kit.js audit` for anything touching
   auth, input, data, payments, files, dependencies.
4. Implementer fixes Blockers/Majors; `kit verify` green again.
5. Fill `templates/PR.md` and open PR.

Prompt: `prompts/05-review.md`
