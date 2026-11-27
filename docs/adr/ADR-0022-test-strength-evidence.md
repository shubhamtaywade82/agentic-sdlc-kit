# ADR-0022: Test-strength evidence — mutation testing in the TDD evidence chain

Status: Accepted
Date: 2026-11-27
Related issues: #45 (kit), agentic-mods#8 (companion verdict surface)

## Context

The TDD machine (ADR-0018) enforces Red → Green → Refactor with persisted,
task-scoped evidence. `kit verify` gates on deterministic pass/fail. Both
are necessary and neither is sufficient: a green suite can be weak. Tests
that assert little, tests coupled to implementation trivia, and coverage
that never touches the mutation points that matter all pass the chain
exactly as fast as rigorous ones. **Evidence of passing is not evidence of
strength** — the chain proves a test was written, failed, and then passed;
it does not prove the test would catch a regression.

Mutation testing measures what nothing else in the kit measures: how many
deliberately broken programs (mutants) the suite actually detects. It is
the natural strength measurement for the evidence chain.

## Decision

### 1. An optional `strength` stage, measured by mutation score

`kit feature <id> strength <task-id>` and `kit verify --strength` run the
stack's mutation tool and record a `StrengthEvidence` entry (contracts,
`verification/strength.ts`) — mutants generated/killed/survived, score,
threshold, scope, duration, budget, tool — into the persisted task records
and the hash-chained journal (`strength.recorded`). The evidence is
schema-versioned like every contract.

### 2. Opt-in by default; `warn` by default

`.ai-kit/project.yml` gains a `verification` section:

```yaml
verification:
  strength:
    enabled: true # default false in v1
    threshold: 60 # mutation score percentage
    budgetMs: 300000
    scope: diff # diff = the task's likelyFiles; suite = full run
    gateMode: warn # warn | enforce
```

Defaults are conservative on purpose: nothing changes for existing
profiles (the section is absent → behavior identical), and a project that
opts in starts in `warn` mode. `gateMode: enforce` refuses `verify`
completion when any completed task's latest strength evidence is below
threshold — or missing, or `incomplete`. An unknown score must not
certify (fail closed).

### 3. Budget is a hard cap; timeouts are honest

A strength run that exceeds `budgetMs` is killed and recorded as
`incomplete` — no score. `verify` never hangs on a slow mutation run.
The same applies to a missing tool (spawn error) and an unparsable
report: `incomplete`, never a fabricated number.

### 4. Incremental by scope

`scope: diff` restricts mutation to the task's planned `likelyFiles`
(e.g. StrykerJS `--mutate <files>`), keeping per-task cycles fast.
`scope: suite` runs the tool's whole target set. Documented limit: a
diff-scoped run can miss cross-file escapes — a mutant in file A caught
only by a test of file B outside the diff.

### 5. Stack adapters, phased

| Stack                                  | Tool          | Status                                      |
| -------------------------------------- | ------------- | ------------------------------------------- |
| `node-typescript` / `react-typescript` | StrykerJS     | Implemented end-to-end                      |
| `python`                               | mutmut        | Adapter implemented, fixture-tested offline |
| `ruby` / `ruby-rails`                  | mutant        | Adapter implemented, fixture-tested offline |
| `go`                                   | go-mutesting  | Adapter implemented, fixture-tested offline |
| `rust`                                 | cargo-mutants | Adapter implemented, fixture-tested offline |
| `dotnet`                               | Stryker.NET   | Adapter implemented, fixture-tested offline |

Adapters map a stack to a tool command (`core/tdd/strength.ts`); output
parsing is per-tool and fixture-tested offline. An unparsable report is
`incomplete` — never a guessed score.

### 6. The phase machine is unchanged

Strength is a **post-refactor** measurement. The Red → Green → Refactor
invariants are untouched; strength never advances or blocks a phase. It
is recorded on top of a completed chain (`TddSession.recordStrength`)
and audited at finalize (`auditStrengthEvidence`). The gate composes
with the chain gate, it does not replace it.

## Honest limits (what this does NOT prove)

- **The mutation score is a proxy, not proof.** It measures how many
  generated mutants the suite killed on one run with one tool. A high
  score raises confidence; it does not establish correctness.
- **Equivalent mutants** inflate the denominator: some mutants are
  semantically identical to the original and no test can kill them.
- **Diff scope misses cross-file escapes** (above).
- **A tool's report format is an external contract**; a format change
  degrades to `incomplete`, which in `enforce` mode blocks — annoying,
  but honest, and visible.
- **Enforce + incomplete blocks.** An unknown score must not certify.
  Teams that hit tool instability in CI should use `warn` mode until
  the tool is stable.

## Alternatives considered

- **Do nothing (pass/fail only)**: rejected — the kit's own principle
  (evidence over claims) applies to the suite itself.
- **Coverage percentage as the strength gate**: rejected — line coverage
  is the weakest proxy; it says a line executed, not that a behavior was
  asserted.
- **Making strength mandatory at 60% kit-wide**: rejected — per-project
  opt-in keeps the default cost profile unchanged; autonomy over the
  threshold belongs to the project.
- **Auto-strengthening (generating tests for survived mutants)**: future
  work, out of scope here; the evidence surfaces which mutants survived,
  which is the prerequisite.
