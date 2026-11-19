# ADR-0005: Project profile lives at `.ai/project.yml`

Date: 2026-11-19 · Status: accepted

## Context

The proposal (§9) illustrates `.ai-kit/project.yml` + `.ai-kit/{state,reports}`.
v4 already installed kit state under `.ai/` (workflows, stack, manifest, mcp).

## Decision

Keep `.ai/` as the kit's single root in installed projects:
`.ai/project.yml`, `.ai/state/`, `.ai/reports/{verification,runs}/`,
`.ai/kit/` (CLI), `.ai/mods/` (runtime). The proposal's taxonomy is preserved
one level down; only the root name differs.

## Consequences

- (+) v4 users keep every installed path except renamed doc directories; the
  manifest/uninstall model works unchanged.
- (+) One dot-directory to gitignore-reason about: committed = profile +
  verification evidence (team's call); local = runs/, state/.
- (−) Divergence from the proposal's literal path (`.ai-kit/`) is cosmetic
  and documented; nothing in the contract depends on the root name.
