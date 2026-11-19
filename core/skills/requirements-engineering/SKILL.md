---
name: requirements-engineering
description: Turn an idea or request into a validated specification with acceptance criteria. Use when writing a feature spec or PRD, when requirements are ambiguous, when writing user stories or acceptance criteria, or before running kit validate-spec.
license: MIT
---

# Requirements Engineering

A spec is a contract: what will be built, for whom, and how we will know it works.
It is written to be validated by `kit validate-spec`, not to impress.

## Inputs first

Ask up to 5 focused questions when intent, users, or constraints are unclear. Then
proceed with **stated assumptions** — a spec with named assumptions beats a stalled one.

## Structure (template `templates/SPEC.md`, output `docs/specifications/features/<slug>.md`)

1. **Problem** — the user pain or business need, in the user's words. One paragraph,
   no solution language.
2. **Scope** — In scope (what this change delivers) and Out of scope (explicit
   non-goals). Out of scope is a promise, not a wish list.
3. **Acceptance criteria** — Given/When/Then bullets, each independently checkable.
   A criterion that cannot be tested is a wish; move it to Non-functional or drop it.
4. **Non-functional requirements** — performance, security, accessibility, data
   constraints that shape the design. "None" is a valid, explicit answer.
5. **Open questions** — tracked unknowns with owners/next steps.

## Criterion quality

- One behavior per criterion; no "and" that hides two tests.
- Testable by a person or script without asking the author.
- Cover: happy path, edge cases (empty, max, unicode, concurrent), error paths.
- In an existing app: add criteria that PIN existing behavior the feature must not
  break (regression criteria are requirements too).

## Greenfield PRDs (Mode A)

For a new application the spec graduates from `templates/PRD.md`: product brief,
target users, core jobs-to-be-done, MVP boundary (the smallest set of complete
vertical slices), and explicit non-goals. The MVP is defined by what is EXCLUDED.

## Validation

```bash
node .ai/kit/bin/kit.js validate-spec docs/specifications/features/<slug>.md
```
Fix every error before design or planning starts. `status: approved` flips the soft
checks to hard errors — only a human flips it.

## Anti-patterns

- Solution language in the problem statement ("we need a queue" is not a problem).
- Criteria that reference implementation ("the service retries 3 times") — specify
  observable behavior ("a transiently failing call eventually succeeds").
- Scope discovered during implementation — new needs become a follow-up spec, not
  silent scope creep.
