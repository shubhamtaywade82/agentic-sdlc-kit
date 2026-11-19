---
name: code-quality
description: Maintainability, refactoring discipline, and self-review before opening a PR. Use when cleaning or restructuring code without changing behavior, when a diff needs a final self-check, or when improving names, structure, or dead code.
license: MIT
---

# Code Quality

Quality work is reviewable, reversible, and explains itself. Two disciplines:
**refactoring** (structure changes, behavior preserved) and **self-review**
(the author's last hard look before anyone else sees the diff).

## Refactoring (behavior-preserving)

1. **Characterize first** — identify or write tests that pin current behavior.
   No refactor behind untested code; add characterization tests before touching it.
2. **Structure only** — no behavior change, no new features, no public-contract
   changes. If behavior must change, that is a feature (`/kit:feature`), not a
   refactor.
3. **Small steps** — one transformation per commit (extract method, rename,
   inline, move) with the suite green between each.
4. **Compare evidence** — same verification before and after
   (`node .ai/kit/bin/kit.js verify`); results identical or improved. Show both.
5. Full protocol: `workflows/07-refactor.md`.

## Maintainability standards

- Clear names over comments; comments explain *why*, not *what*.
- Functions do one thing; guard clauses over deep nesting.
- No dead code, no commented-out code, no debug prints left behind.
- Handle errors explicitly at boundaries; never swallow exceptions.
- Public APIs get types + docs; breaking changes need an ADR.
- A new dependency is a maintenance liability — justify it (size, maintenance,
  license) or skip it.
- When structure fights back, check `design-pattern-selection` before inventing
  your own architecture.

## Self-review before the PR

1. Read the **actual** `git diff` — every file intentional, nothing smuggled in.
2. Walk each acceptance criterion → the code that satisfies it → the test that
   proves it. Any gap is unfinished work.
3. Check `checklists/code-review.md` as a reviewer would, and
   `checklists/security.md` if auth/input/data/files are touched.
4. Run `node .ai/kit/bin/kit.js verify` and `kit audit`; attach the evidence.
5. Leave the campsite better: docs/types/tests touched by the change get updated
   in the same PR.

## Definition of done

`checklists/definition-of-done.md` is the authoritative gate table. Summary:
criteria met, gates green, diff reviewed, docs updated, no TODOs left in the diff.
