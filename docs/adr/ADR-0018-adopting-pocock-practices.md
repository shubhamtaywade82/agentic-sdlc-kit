# ADR-0018: Adopting Matt Pocock's engineering practices — evidence-gated TDD, honest reporting, and calibrated memory

Status: Accepted
Date: 2026-11-20
Milestone: Corrective implementation phase (post-0.7.2 re-review)

## Context

We evaluated four of Matt Pocock's repositories as potential sources of
engineering methodology for the kit:

1. **`skills`** — an agent-skills library whose highest-value entries are
   `grill-with-docs` (interrogate requirements before specifying),
   `to-spec` (specifications derived from interrogated requirements),
   `tdd` (Red/Green/Refactor with *enforced* phase evidence),
   `diagnosing-bugs` (reproduce and diagnose before fixing), and
   `improve-codebase-architecture` (architecture assessment via
   Ousterhout's deep-module lens, read-only by default).
2. **`sandcastle`** — an execution architecture with clean provider
   abstractions (`AgentProvider`, `SandboxProvider`, `GitWorkspace`).
3. **`agent-rules-books`** — a knowledge model for progressive disclosure
   of engineering-book wisdom (mapping situations → chapters, not
   installing whole books).
4. **`dictionary-of-ai-coding`** — a vocabulary reference for AI coding.

The evaluation found five weaknesses in the kit that these repositories
address in spirit:

- **W1**: The feature workflow starts implementing before requirements
  are aligned (no interrogation stage).
- **W2**: There is no shared domain language linking spec, tests, code,
  and review (no project glossary).
- **W3**: TDD is *performed* but not *enforced* — the workflow runs
  "Red" and "Green" verifications back to back with no implementation
  handoff between them, discards the TDD state machine's verdicts, and
  fabricates a Refactor result. Missing evidence never blocks completion.
- **W4**: The Evolution Lab's benchmark runner returns
  `notImplemented: true`, yet the CLI reports `Evolution Lab: COMPLETED`
  and computes metrics from the empty results.
- **W5**: Learning signals are uncalibrated — `failureSummary` is just
  the literal string `failed` (no actual failure evidence), and memory
  `confidence = successCount / appliedCount`, so a single success yields
  confidence 1.0.

## Decision

The kit's differentiation is **lifecycle orchestration, governance,
contracts, and evidence** — not being a skills library, a sandbox
runtime, or a book. Pocock's work therefore influences the kit's
*engineering methodology* (what the workflow enforces and what evidence
it demands), not its overall architecture.

### Adoption matrix

| Source concept | Decision | How it lands in the kit |
| --- | --- | --- |
| `tdd` — evidence-gated phases | **Adopt (P0)** | Phase-driven feature workflow with persisted evidence; missing evidence blocks completion (this ADR, §Design 1) |
| Honest reporting over theater | **Adopt (P0)** | `not-run` experiment verdict; Evolution Lab never reports placeholders as complete (§Design 2) |
| Evidence over summaries | **Adopt (P0)** | Failure summaries carry real failing-check evidence; memory confidence is sample-size aware (§Design 3) |
| `grill-with-docs` — interrogate before specifying | **Adopt (P1)** | Requirement-discovery workflow: challenge gaps with pointed questions; never silently fabricate answers |
| `to-spec` — shared domain language | **Adopt (P1)** | Project `GLOSSARY.md` referenced by spec, tests, and review; terms become contracts |
| Test seams before implementation | **Adopt (P1)** | Plan validation requires an explicit test seam per task before implementation begins |
| `improve-codebase-architecture` — deep modules, read-only | **Adopt (P2)** | Architecture assessment reports deep/shallow module findings; changes only via explicit human-authorized follow-up |
| `diagnosing-bugs` — reproduce first | **Adopt (P2)** | Fold into bug-fix workflow gate (already partially present) |
| `retro` → CLSE pipeline | **Adopt (P2)** | Retro distinguishes observed facts from agent interpretation; produces proposals, never auto-applied global changes |
| `sandcastle` provider abstractions | **Adapt (P2/P3)** | Influences the `AgentProvider`/execution contract; worktree isolation is *git* isolation, not a security boundary |
| `agent-rules-books` knowledge model | **Reference (P2)** | Progressive-disclosure pattern for knowledge packs; we do not copy copyrighted book content |
| `dictionary-of-ai-coding` | **Reference only** | Vocabulary input when building the glossary tooling; no direct integration |

### Explicit rejections

- **Install all skills globally.** The kit is a governed lifecycle, not a
  prompt supermarket. Skills are adopted as workflow *stages with
  contracts and evidence*, not as unconditional prompt injections.
- **Use all engineering books simultaneously.** Context is finite;
  knowledge must be progressively disclosed per situation.
- **Adopt Sandcastle as the kit's runtime.** The kit is
  runtime-independent by contract; Sandcastle informs the execution
  provider contract at most.
- **Auto-apply architecture suggestions.** Architecture assessment is
  read-only until a human authorizes changes.
- **Treat agent exit as success.** Success requires verified evidence
  chains, not process completion.
- **Copy the `skills` repository.** We adopt the practices' semantics
  (question-first, evidence-gated) with our own implementation under our
  license and architecture.

## Design (P0 scope, released as 0.8.0)

### 1. Real TDD handoff (`feature-workflow`)

The agent — not the workflow — writes tests and implementations. The
workflow becomes a **phase driver** with a persisted run state at
`.ai-kit/state/feature-runs/<featureId>.json`:

```
kit feature <id> start                validate spec/plan/profile, init run
kit feature <id> red <task>           run verification; MUST fail; record evidence
        (agent writes the failing test, then calls red)
        (agent implements minimally, then calls green)
kit feature <id> green <task>         run verification; MUST pass; record evidence
        (agent refactors, then calls refactor)
kit feature <id> refactor <task>      run verification; MUST pass; record evidence
kit feature <id> status               show run state and next action
kit feature <id> verify               all tasks evidence-complete → final report
```

Invariants (enforced by the existing `TddSession` machine, now with
verdicts checked and state persisted):

- **Red requires observed failure.** A passing Red is an invariant
  violation (the test does not test anything), not a success. A report
  with zero executed checks (empty command set, or everything
  skipped/blocked) is rejected as vacuous evidence — "nothing ran" is
  not "the test failed".
- **Green requires observed success** of the *same* verification
  surface, after real agent work happened between invocations.
- **Refactor re-runs verification.** No fabricated statuses.
- **Every phase records evidence**: command, check statuses, duration,
  and a bounded output excerpt (last 2000 chars per check, as captured
  by `ProcessVerificationRunner`). Evidence is redacted before
  persistence in learning records.
- **Completion is evidence-gated.** The one-shot `runFeatureWorkflow`
  now audits the persisted chain: if any task in the plan's execution
  order lacks a complete Red→Green→Refactor evidence chain, the run
  fails with `tddEvidenceMissing` instead of reporting success.

P1 refinement (landed — task-scoped Red evidence): Red/Green/Refactor
phase gates now run the TASK'S OWN `verification.command` from the plan,
not the whole project profile, and classify the observed failure.
Only a failure classified `assertion` (the targeted test ran, was
discovered, and failed at an assertion) establishes Red; compilation,
dependency, discovery, environment, timeout, and unclassified failures
are persisted as rejected attempts without advancing the phase — prefer
a false-negative Red over a false-positive Red. Each step record carries
the verification metadata (task id, command, classification, reason).
Evidence records written by the pre-P1 engine (no verification metadata)
are treated as unclassified and cannot complete a chain (fail closed,
lazy migration). The full profile is still audited once at `verify`
(finalize), where whole-project status remains the gate.

### 2. Honest Evolution Lab reporting

- The `BenchmarkRunner` contract may return `notImplemented: true` for
  baseline and/or candidate evaluation.
- `EvolutionLab.runExperiment` then produces a report with verdict
  **`not-run`** (new enum member) and zeroed metrics — an honest
  "we did not measure this" artifact.
- `kit evolve` counts executed vs. not-run experiments separately:
  metrics are computed **only** from executed experiments, and the
  summary prints `Evolution Lab: NOT RUN …` when nothing executed.
  Hypotheses without benchmark results remain **proposals**; no
  promotion request is ever created from a `not-run` report.

### 3. Calibrated learning signals

- **Experience records**: `failureSummary` is built from the *actual*
  failing checks (check id + first error line, bounded, redacted) rather
  than the bare status string. Phases carry real durations.
- **Memory confidence**: replaced with the **Wilson 95% lower bound** of
  the success ratio. One success out of one application yields ≈ 0.21
  instead of 1.0; confidence approaches the raw ratio only as the
  sample grows. A memory must earn trust with evidence volume.

## Acceptance criteria (P0)

1. A feature run cannot reach `passed` without a complete, persisted
   Red(fail)→Green(pass)→Refactor(pass) evidence chain per task.
2. A passing Red (test never failed) is rejected as an invariant
   violation.
3. A Red backed by zero executed checks is rejected as vacuous evidence.
4. Phase invocations out of order (e.g. `green` before `red`) are
   rejected with the current phase in the error.
5. `kit evolve` with an unimplemented benchmark environment never
   prints `COMPLETED`; it reports not-run counts and keeps hypotheses
   as proposals.
6. `failureSummary` on failure records contains failing-check evidence,
   not just `failed`.
7. After a single successful application, memory confidence < 0.5.

## Sequencing beyond P0

- **P1**: requirement discovery (grill) and project glossary; test-seam
  validation in plans; per-check Red/Green attribution.
- **P2**: read-only architecture assessment; retro→CLSE pipeline;
  progressive-disclosure knowledge packs; `AgentProvider` contract.
- **P3**: sandbox provider + git worktree execution; parallel multi-agent
  orchestration on top of the provider contracts.

Each stage ships as a vertical slice with contracts, evidence, and
tests before the next begins.
