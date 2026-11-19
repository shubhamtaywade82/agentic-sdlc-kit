# GEMINI.md

Read the file `AGENTS.md` in the repository root and follow it strictly — it is the
source of truth for how to work in this repository.

Gemini-specific notes:
- Follow the lifecycle in `.ai/workflows/00-overview.md` — three modes (new app,
  existing-app feature, fix/refactor); stage prompts are in `.ai/prompts/`.
- Templates (PRD, SPEC, TECH_SPEC, PLAN, PR, ADR) are in `.ai/templates/`;
  checklists in `.ai/checklists/`.
- Deterministic gates via the kit CLI (`node .ai/kit/bin/kit.js`):
  `validate-spec`, `validate-plan` before building; `verify` before claiming
  done; `audit` and `release-check` before release. Reports land in
  `.ai/reports/`.
- Approval gates in section 6 of `AGENTS.md` apply in every session: push,
  merge, tag, release, deploy, migrations, and destructive operations all need
  explicit human approval.
- Agent Skills for this stack are in `.claude/skills/` (agentskills.io format):
  nine SDLC skills. Read the matching `SKILL.md` when a task fits.
- Stack conventions and design patterns: the installed stack pack under
  `.ai/stack/<name>/` (its AGENTS.md and patterns/ directory).
