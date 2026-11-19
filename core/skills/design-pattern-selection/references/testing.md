# Testing Techniques

Complements skill `tdd-bdd` (the discipline) — this reference is about test
DESIGN: what kinds of tests to write, where, and what each kind proves.

## Test Pyramid

- **What** — many fast unit tests, some integration tests, few end-to-end
  tests.
- **Why** — feedback speed and failure localization: a unit failure names the
  defect; an E2E failure names a crime scene.
- **Shape it** — a CRUD-heavy app can be healthier with more integration
  tests (logic thin, wiring thick); an algorithm-heavy core can be
  nearly all unit tests. The invariant: E2E is the smallest layer, reserved
  for journeys too cross-cutting to prove otherwise.
- **Anti-patterns** — ice-cream cone (all E2E) — slow, flaky, unlocalizable;
  hourglass (units + E2E, no integration) — wiring untested until production.

## Contract Testing

- **What** — consumer tests pin the exact request/response expectations;
  provider tests replay them against the real provider, proving compatibility
  without a shared environment.
- **When** — you expose an API/queue schema consumed by other services or
  teams; consumers and providers deploy independently.
- **When NOT** — single consumer deployed in lockstep; internal function
  boundaries (that's plain unit tests + types).
- **Discipline** — contract in the repo of the CONSUMER (expectations are the
  consumer's truth); provider CI verifies the contract set; additive changes
  pass, breaking changes fail BEFORE release, not in prod.
- **Anti-patterns** — "contract tests" that just replay one golden response
  (that's a snapshot test); contracts owned by the provider (they'd verify
  themselves against themselves).

## Property-Based Testing

- **What** — state an invariant (property), let the framework throw hundreds
  of generated inputs at it; a failing case shrinks to the minimal
  reproducer.
- **When** — pure-ish logic with real invariants: serializers round-trip,
  parsers never crash, sorted output is a permutation of input, state machine
  laws (merge is commutative),金额 calculations conserve totals.
- **When NOT** — workflow/UI glue with no crisp invariant; tests that need
  "the" example to communicate intent (pair property tests with example
  tests).
- **Discipline** — keep properties small and law-shaped; seed control for
  reproducibility; a discovered counterexample becomes a regression example
  test.
- **Anti-patterns** — property that restates the implementation (tautology);
  unseeded runs nobody can reproduce.

## Mutation Testing

- **What** — tool mutates production code (flip operator, drop boundary
  check) and re-runs tests; surviving mutants = tests that pass when the code
  is wrong.
- **When** — sampling the suite's real strength: critical modules before a
  release or after a bug cluster; calibrating a new team's test culture.
- **When NOT** — every CI run (expensive); chasing 100% kill rate (some
  mutants are equivalent or worthless).
- **Discipline** — read surviving mutants as test-case ideas; treat
  "no tests kill any mutant in this file" as a finding, not a score.
- **Anti-patterns** — mutation score as a KPI (teams write assertion-free
  tests to game it).

## Test Doubles

| Double | Behavior | Use |
|---|---|---|
| Dummy | Passed, never used | Fill a parameter list |
| Fake | Working cheap implementation | In-memory repo in domain tests |
| Stub | Canned answers to calls | Directing the code under test down a path |
| Spy | Stub that records calls | Verifying an interaction happened (side effect) |
| Mock | Pre-programmed expectations | The interaction IS the specification (rare — protocol objects) |

- **Discipline** — mock the contract, not the implementation: stub interfaces
  you own or protocols you've verified (contract tests again); prefer fakes
  for repositories; assert state over interactions whenever observable state
  exists.
- **Anti-patterns** — mocking what you don't own (third-party SDK internals —
  the mock lies after any SDK update); mock-heavy suites that pass while the
  real wiring is broken (balance with integration tests); verification of
  calls that are incidental, not specified.

## Placement rules (where tests live)

- Unit tests next to the code (same module tree) — friction kills writing.
- Contract suites in the consumer's repo, published for provider CI.
- E2E in a top-level `tests/e2e` — deliberately few, deliberately slow.
- Shared test helpers get a `tests/helpers` — but beware the helper becoming
  an untested second product.
