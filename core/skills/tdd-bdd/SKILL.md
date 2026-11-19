---
name: tdd-bdd
description: Strict red-green-refactor discipline and Given/When/Then behavior specification for planned tasks and bug fixes. Use when implementing tasks from a plan, when a test is hard to write, when tempted to write code before a test, or when a bug fix needs a regression test.
license: MIT
---

# TDD / BDD

One task from the plan per cycle. Never write production code without a failing
test that demands it. Specification (Given/When/Then) and verification (the
test) stay translation-close.

## The cycle

1. **Pick** exactly one unchecked task from `docs/plans/<slug>.md`.
2. **Red** — write the smallest test that expresses the task's acceptance. Run it.
   Show the failure. If it passes, the test is wrong or the behavior exists — stop and reconsider.
3. **Green** — write the minimal code that makes the test pass. No extra features,
   no "while I'm here".
4. **Verify** — run the gates: `node .ai/kit/bin/kit.js verify` (suite + lint +
   types per the project profile). Show output.
5. **Refactor** — improve names and structure while tests stay green (small steps).
6. **Commit** — one conventional commit per task, tick the task in the plan, stop.

## BDD mapping

Spec acceptance criteria are Given/When/Then; each becomes one test case:

| Spec | Test |
|---|---|
| GIVEN a valid user with no orders | arrange: fixture/factory |
| WHEN they request their orders | act: call the unit/endpoint |
| THEN an empty list is returned, 200 | assert: response + status |

One criterion → one test name (`it "returns an empty list for a user with no
orders"`). If a criterion needs "and" to justify the test, split the criterion.

## Red-phase rules

- Test name states the behavior, not the implementation.
- Test one reason to fail.
- If the test needs > 3 setup objects, the design may be wrong — ask before building fixtures.
- Deterministic only: freeze time, stub network, seed randomness.

## Green-phase rules

- Minimal diff. Fake it till you make it: constant → variable → structure.
- Never add branches "for later".
- New dependency = stop and justify (size, maintenance, license) before adding.

## Bug fixes

A bug fix starts with a failing regression test that reproduces the bug
(`workflows/06-debug.md`). The fix is done when that test passes, the full
`kit verify` is green, and nothing else broke.

## Evidence, not claims

Report verification output, not conclusions. A skipped test is never a passed
test — say what was skipped and why.
