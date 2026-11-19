---
description: Start a new application lifecycle — idea to released MVP
argument-hint: "<product idea>"
---
Build a new application from this idea: $ARGUMENTS

This is Mode A (greenfield). Follow `workflows/00-overview.md`. Never attempt the whole application in one implementation cycle — build the MVP as complete vertical slices, each leaving the app working.

1. **Profile** — if `.ai/project.yml` is missing, run `node .ai/kit/bin/kit.js init --mode greenfield` and confirm it with me. ⏸
2. **Brief & PRD** — product brief → `docs/product/PRD.md` using `templates/PRD.md`. Ask up to 5 questions, then proceed with stated assumptions. ⏸ approve acceptance criteria
3. **System design** — architecture + ADRs (`templates/ADR.md`), data model, API contracts, security notes → `docs/architecture/system-design.md` + `docs/architecture/adr/`. ⏸ approve design
4. **Plan** — vertical-slice implementation plan → `docs/plans/<slug>.md` using `templates/PLAN.md`. Validate: `node .ai/kit/bin/kit.js validate-plan docs/plans/<slug>.md`. Fix every error before continuing. ⏸ approve plan
5. **Build** — branch `feat/<slice>`, one slice at a time, TDD per skill `tdd-bdd`: one task per commit. After each slice: `node .ai/kit/bin/kit.js verify` and show me the report.
6. **Review** — `/kit:review` in a fresh context. Fix all Blockers/Majors.
7. **Docs & release** — update setup/API docs, then `/kit:release`.

Rules: each slice must end working (tests green); no slice may skip its tests; do not defer acceptance criteria to "later polish".
