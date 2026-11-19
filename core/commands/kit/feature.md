---
description: Build a complete feature increment in an existing application
argument-hint: "<feature description>"
---
Deliver this feature end-to-end without damaging existing functionality: $ARGUMENTS

This is Mode B — the highest-value workflow. Follow `workflows/00-overview.md`; every numbered step ends at a ⏸ gate unless I say "go on".

1. **Understand first** — never propose abstractions before reading the existing code. Use the `repository-analyst` agent: working tree state, existing plans in `docs/plans/` (never overwrite an incomplete plan from another task), architecture and conventions, affected modules. Report the impact map before designing. ⏸
2. **Specification** — feature spec → `docs/specifications/features/<slug>.md` (template `templates/SPEC.md`; reuse existing services/components; note every public contract you must preserve). Validate: `node .ai/kit/bin/kit.js validate-spec docs/specifications/features/<slug>.md`. ⏸ approve acceptance criteria
3. **Design** (only if the feature changes architecture, data, or API contracts) — `docs/architecture/adr/` entry when the decision has architectural consequence; DB changes must be backward-compatible. ⏸
4. **Plan** — vertical-slice task plan → `docs/plans/<slug>.md` (template `templates/PLAN.md`; every task has acceptance + verification; dependencies explicit; include regression tests for existing behavior). Validate: `node .ai/kit/bin/kit.js validate-plan docs/plans/<slug>.md`. Zero errors before building. ⏸ approve plan
5. **Build** — branch `feat/<slug>`. TDD per skill `tdd-bdd`: one task per cycle, one commit per task, `node .ai/kit/bin/kit.js verify` green before each commit. Never claim success on skipped tests.
6. **Review** — `/kit:review` in a fresh context. Fix all Blockers/Majors.
7. **Docs** — update docs touched by the feature; fill `templates/PR.md` and show me before opening a PR. Verify the actual `git diff` — every file intentional.

Rules from `workflows/00-overview.md`: inspect before abstracting; preserve public contracts; reuse existing patterns (skill `design-pattern-selection`); backward-compatible migrations; verify the real diff before declaring done.
