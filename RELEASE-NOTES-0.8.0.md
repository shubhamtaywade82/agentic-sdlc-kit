# Release Notes — agentic-sdlc-kit 0.8.0

## Theme: Evidence-gated TDD and honest reporting (ADR-0018)

This release implements the P0 scope of ADR-0018 ("Adopting Matt
Pocock's engineering practices"). It corrects the two most serious
findings of the 20 November re-review of `main`: the feature workflow
performed TDD **without an implementation handoff** (Red and Green ran
back to back, the state machine's verdicts were discarded, and Refactor
was fabricated), and the Evolution Lab reported placeholder benchmarks
as `COMPLETED`.

## Breaking / behavioral changes

### 1. Feature workflow is now a phase driver (real TDD handoff)

`kit feature` no longer pretends to run Red/Green/Refactor inside one
invocation. The agent writes tests and implementations **between**
invocations; the kit verifies, records evidence, and enforces the phase
invariants:

```bash
kit feature FEATURE-001 start
kit feature FEATURE-001 red TASK-001       # verification MUST fail
kit feature FEATURE-001 green TASK-001     # verification MUST pass (after implementing)
kit feature FEATURE-001 refactor TASK-001  # verification MUST pass again
kit feature FEATURE-001 status
kit feature FEATURE-001 verify             # evidence audit + final verification
```

- Run state persists at `.ai-kit/state/feature-runs/<featureId>.json`
  (atomic writes) — the evidence chain survives process exits.
- **Red requires observed failure.** A passing Red is an invariant
  violation (the test does not test anything).
- **Refactor re-runs verification.** No fabricated statuses.
- Every phase records bounded, redacted evidence (per-check statuses
  plus an excerpt of the failing output).
- Failed phase attempts (e.g. calling `green` before the implementation
  works) are persisted as real evidence and remain retryable.
- **One-shot `runFeatureWorkflow` is now an audit**: it fails with
  `TDD evidence missing` unless every task in the execution order has a
  complete Red(failed) → Green(passed) → Refactor(passed) chain.
- Phase invocations out of order are rejected with the current phase.
- `FeatureRunReport` gains `tddEvidence` (per-task record chain).
- `TddSession` accepts an optional snapshot to resume persisted
  sessions.

Known trade-off (P1 follow-up): Red/Green semantics use report-level
status across all profile commands; per-check phase attribution is
refinement work. The recorded output excerpts keep Red failures
auditable.

### 2. Evolution Lab: `not-run` verdict, honest CLI reporting

- `ExperimentReport.verdict` adds **`not-run`**. When the benchmark
  environment is unavailable, `EvolutionLab.runExperiment` returns a
  not-run report with zeroed metrics instead of an "inconclusive"
  experiment built from nothing.
- `BenchmarkRunner` evaluation results may carry `notImplemented: true`.
- `kit evolve` now prints `Evolution Lab: NOT RUN (benchmark
  environment unavailable)` when nothing executed, reports `N executed,
  M not run`, and computes metrics **only from executed experiments**
  (otherwise explicitly withheld). Hypotheses without benchmark results
  are labeled proposals pending benchmark evidence; no promotion
  request is ever created from a not-run report.

### 3. Calibrated learning signals

- **Experience records**: `failureSummary` is built from the actual
  failing checks (check id + first error line, bounded to 500 chars,
  redacted) instead of the bare string `failed`.
- **Memory confidence**: `MemoryStore.recordApplication` now uses the
  **Wilson 95% lower bound** of the success ratio. One success out of
  one application yields ≈ 0.207 instead of 1.0; confidence approaches
  the raw ratio only as the sample grows. `wilsonLowerBound` is
  exported for reuse and testing.
- Secret redaction for persisted kit state now uses a shared
  `DEFAULT_REDACTION_POLICY` exported from the redactor (single home,
  applied to experiences and TDD run evidence alike).

## New documentation

- `docs/adr/ADR-0018-adopting-pocock-practices.md` — the single
  adoption specification: decision matrix (adopt / adapt / reference /
  reject) for the evaluated external engineering practices, the P0
  design, acceptance criteria, and the P1–P3 sequencing.

## Version alignment

- All 11 `package.json` manifests, the CLI `VERSION` constant, the
  installer's `packageVersion`, and the version-asserting tests now
  consistently report `0.8.0`.

## Verification

- Build: 10/10 packages.
- Tests: 500/500 across 10 packages (15 new tests covering the phase
  driver, phase-order enforcement, evidence persistence, the evidence
  gate, the not-run verdict, Wilson calibration, and failure-evidence
  capture).
- `check:architecture`, `typecheck`, and `lint` all pass.
