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

### 4. Verification-driven correctness fixes (from the 0.7.3 audit)

A full behavioral verification of the kit (fresh clone, pinned pnpm, all
packages built, every CLI command exercised against real projects) found a
set of defects shared with this branch's base. All are fixed here, each
with regression tests. The theme, as in ADR-0018: **nothing may be
silently fabricated**.

**Runtime plugins load for real now (P0).** All four plugins shipped
`hooks/hooks.json` declaring `"modules": ["./hooks/register.js"]` — a
path that never existed (neither in a fresh clone nor after `pnpm run
build`), so `claude plugin validate` rejected every plugin. The manifests
now declare `../dist/hooks/register.js`, resolved relative to the `hooks/`
directory exactly as the Claude Code plugin validator resolves it, and the
build bundles each entry with `scripts/bundle-hooks.mjs` (esbuild) into a
self-contained ES module that imports nothing but its own files and
`claude-code` — the validator's hard rule. `register` is now a top-level
function declaration, `turn.step` uses the streaming generator form, and
every `$.state` reference uses `{ plugin, key }` literals named in each
plugin's `contract.d.ts` (via `plugin.json`'s `types` field).

**`kit install` links the plugins it promises (P0).** The `full-sdlc` and
`runtime` profiles claimed runtime governance but never touched the
plugins. They now link all four guard plugins into
`<project>/.claude/plugins/` (new `plugin-linker.ts`), validating each
hooks module path **before** linking — an unbuilt kit repo produces an
explicit per-plugin warning and links nothing, never a silent broken
install. Plugin links appear in dry-run plans, install output, and the
ownership manifest.

**Honest git state.** `kit inspect` on a folder with no `.git` reported
`branch=main, commit=0000000` — fabricated. `GitState` gains `isRepo`;
outside a work tree the scanner returns empty branch/headSha and
`kit inspect` prints `(not a git repository)`.

**Evidence-based stack detection.** Any `Gemfile` labeled a project
`ruby-rails`; any Python project reported `pytest` + `pip`. Rails now
requires Rails evidence (app layout, `bin/rails`, or a `rails` gem);
plain Ruby projects are labeled `ruby`. `pytest` is reported only with
evidence (dependency, `pytest.ini`, or `conftest.py`), and `poetry`/`uv`
are detected before defaulting to `pip`.

**No silent `FEATURE-001`.** A `SPEC.md` without a well-formed
`# FEATURE-NNN: Title` heading parsed as `id: FEATURE-001, title: Untitled
Feature`. Malformed title lines are now a hard `SPEC_INVALID` error.

**Profile YAML: no silently dropped commands.** The hand-rolled parser
rejected the serializer's own single-quoted flow arrays (prettier's
canonical formatting of the kit's output) and silently ignored them,
leaving `kit verify` BLOCKED with zero checks. The parser now accepts
single/double-quoted flow arrays, plain scalar commands, and flow-style
category values; anything unparseable is a hard error with a line number.
`kit verify` with zero checks prints the expected YAML shape.

**Feature/plan identity cross-check.** The workflow now cross-checks
`spec.id` and `plan.featureId` against the requested feature id — a
mismatched directory is an error, not a silent substitution.

**Other fixes from the same audit.**

- **CI actually runs now.** `.github/workflows/ci.yml` had
  `branches: ain]` (a broken scalar, matching no branch) on both the
  `push` and `pull_request` triggers — CI never executed. It now triggers
  on `[main]`.
- **`sideEffects: false`** declared for `contracts`, `core`, and
  `mod-sdk`. Without it, esbuild could not tree-shake the workspace
  barrels and the plugin hooks bundles dragged in the entire core
  (including `node:` builtins), failing the self-containment rule the
  Claude Code plugin validator enforces.
- **`kit verify` explains schema failures.** A profile that fails schema
  validation now prints the structured issues (e.g.
  `at 'stack': stack must contain at least one entry`) instead of a bare
  `ProjectProfile failed schema validation`.

## New documentation

- `docs/adr/ADR-0018-adopting-pocock-practices.md` — the single
  adoption specification: decision matrix (adopt / adapt / reference /
  reject) for the evaluated external engineering practices, the P0
  design, acceptance criteria, and the P1–P3 sequencing.

## Version alignment

- All 11 `package.json` manifests, the CLI `VERSION` constant, the
  installer's `packageVersion`, the four plugin `plugin.json` /
  `capabilities.json` manifests, and the version-asserting tests now
  consistently report `0.8.0`.

## Verification

- Build: 10/10 packages; all four plugin hooks bundles are self-contained
  (relative imports and `claude-code` only).
- Tests: 539/539 across 10 packages (39 new tests covering the plugin
  manifests, plugin linker, YAML parser, stack detector, git scanner,
  spec parser strictness, schema-issue surfacing, and the zero-checks
  hint).
- `check:architecture`, `typecheck`, and `lint` all pass; `pnpm install
  --frozen-lockfile` succeeds (CI uses it).
- Behavioral smoke: plugin linking (fresh, idempotent re-install, and the
  unbuilt-kit warning), the full phase-driver cycle
  (`scripts/smoke-080.sh`), the one-shot audit refusal, and the CLI
  honesty fixes were all exercised against the built CLI.
