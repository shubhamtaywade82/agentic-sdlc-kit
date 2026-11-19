# 02 — Technical Spec

**Goal:** Decide *how* before building.

Steps
1. AI reads the PRD/spec and explores the codebase (skill `repo-discovery`; entry
   points, models, similar features).
2. AI drafts `docs/specifications/technical/<slug>.md` from `templates/TECH_SPEC.md`:
   data model changes, API contracts, components touched, sequence of calls, failure modes,
   security, performance, migration/rollout, test strategy.
   Feature specs live in `docs/specifications/features/` (template `templates/SPEC.md`,
   validated by `kit validate-spec`).
3. AI proposes 2–3 options for any significant decision with trade-offs; you pick.
4. Record major decisions as ADRs (`templates/ADR.md`) in `docs/architecture/adr/`.

Prompt: `prompts/02-spec.md` · Skill: `system-design`
Exit gate: no "TBD" in critical sections; risks have mitigations.
