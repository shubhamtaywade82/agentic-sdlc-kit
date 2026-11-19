# ADR-0004: Deterministic gates before LLM judgment

Date: 2026-11-19 · Status: accepted

## Context

A Skill saying "validate your plan" proves nothing. The proposal (§8): turn
advice into engineering gates with predictable inputs, outputs, and exit
codes; never execute arbitrary shell strings from model-generated plans.

## Decision

The `kit` CLI (zero runtime dependencies, committed `dist/`) implements the
gates: `validate-spec`, `validate-plan`, `verify` (PASS/FAIL/SKIPPED/BLOCKED
report), `audit`, `release-check`, plus `doctor`/`inspect`/`init`/`changed`/
`scaffold`. Workflow commands MUST call them and MUST NOT proceed while a
mandatory gate fails. Quality commands execute strictly as validated argv
arrays with `shell:false` and per-command timeouts. A skipped check is never
a passed check.

## Consequences

- (+) "Done" becomes evidence (`.ai/reports/verification/*.json`), citable in
  review and required by release-check.
- (+) No shell-injection surface from model output; timeouts bound runaway
  commands.
- (−) Validators impose document structure (frontmatter, headings); cost is
  amortized by `kit scaffold` templates producing conforming artifacts.
- (−) Gaps in gate coverage (e.g. "is the code GOOD?") remain judgment work —
  deliberately routed to review agents and checklists, not fake-scripted.
