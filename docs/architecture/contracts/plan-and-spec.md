# Contract: Spec & Plan Formats (and validator rules)

Validators: `kit validate-spec`, `kit validate-plan`. Templates:
`templates/SPEC.md`, `templates/PLAN.md` (`kit scaffold` writes the same
shapes). The `/kit:feature` workflow MUST NOT proceed to implementation while
mandatory validation fails.

## Feature spec — `docs/specifications/features/<slug>.md`

```markdown
---
kind: spec
mode: feature        # feature | app | fix
status: draft        # draft | approved  (only humans flip to approved)
---
# Spec: <title>

## Problem            (non-empty)
## Scope
### In scope          (≥ 1 item)
### Out of scope      (≥ 1 item)
## Acceptance Criteria   (≥ 1 bullet matching GIVEN|WHEN|THEN|should|must)
## Non-functional Requirements   (section required; "None" allowed)
## Open Questions     (section required; empty list allowed)
```

Validator rules: frontmatter `kind` must be `spec`; all listed sections
required at the shown levels; while `status: draft`, the soft sections
(NFR, Open Questions, and empty-scope findings) degrade to warnings; with
`status: approved` every finding is an error. Error objects carry
`{file, line, code, message}` — codes: `MISSING_SECTION`, `EMPTY_SECTION`,
`NO_ACCEPTANCE_CRITERIA`, `BAD_FRONTMATTER`. Exit 0 pass / 1 fail / 2 usage.

Related: PRDs (`docs/product/`, template `PRD.md`) for Mode A; technical
specs (`docs/specifications/technical/`, template `TECH_SPEC.md`) are design
documents — the validator targets FEATURE specs.

## Implementation plan — `docs/plans/<slug>.md`

```markdown
---
kind: plan
spec: ../specifications/features/<slug>.md   # must exist and have kind: spec
mode: feature
---
# Plan: <title>

## Approach          (non-empty)

## Tasks
### TASK-001: <title>
- Depends: none                 # or: TASK-001, TASK-002 (must exist)
- Acceptance:
  - <criterion>
- Verification:
  - <command or observation>
### TASK-002: …

## Checkpoints       (must contain a "design review" item and a
                     "test review"/"verification review" item)
```

Validator rules: task ids `TASK-###` (3+ digits), unique; every task needs
Depends + ≥1 Acceptance + ≥1 Verification; dependency references must exist;
the dependency graph must be acyclic (violations: `CYCLE_DETECTED` with the
cycle path); >15 acceptance+verification items on one task = `TASK_TOO_LARGE`
warning; `SPEC_NOT_FOUND` / `SPEC_KIND_MISMATCH` when the spec link breaks.
Exit 0 pass / 1 fail / 2 usage.

## Why frontmatter + headings (not JSON)

These are engineering documents humans read and edit in review; the parser
accepts the whole markdown superset and only asserts structure. Line numbers
in errors point reviewers at the exact spot.

## Registry of error codes

`validate-spec`: `MISSING_SECTION`, `EMPTY_SECTION`, `NO_ACCEPTANCE_CRITERIA`,
`BAD_FRONTMATTER`.
`validate-plan`: `MISSING_SECTION`, `EMPTY_SECTION`, `BAD_FRONTMATTER`,
`DUPLICATE_TASK_ID`, `DEPENDENCY_NOT_FOUND`, `MISSING_ACCEPTANCE`,
`MISSING_VERIFICATION`, `CYCLE_DETECTED`, `TASK_TOO_LARGE` (warning),
`SPEC_NOT_FOUND`, `SPEC_KIND_MISMATCH`.
