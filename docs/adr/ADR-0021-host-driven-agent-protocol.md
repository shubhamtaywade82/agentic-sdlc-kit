# ADR-0021: Host-driven agent protocol — `kit next`, the execution journal, and Tier C conformance

Status: Accepted
Date: 2026-11-22
Milestone: M37 — Host-Driven Agent Protocol

## Context

ADR-0019 established two execution modes: **Mode 1** (kit-orchestrated —
the kit drives an agent through a provider) and **Mode 2** (phase-driven —
a human or agent drives the kit through `kit feature` subcommands).
ADR-0020 bounded the Mode 1 direction with one policy source and honest
capability declarations (`AgentProviderCapabilities`).

The other direction was documented but never _contractual_. Cursor,
Antigravity (AGY), and CI pipelines drive the kit through its CLI
(`docs/HOST_INTEGRATIONS.md`). Today that integration is prose: the host
is _told_ to respect the workflow, reads human-formatted `status` output,
and has no machine-readable way to ask "what is the next action?" — and
no tamper-evident record of what was actually executed.

Two failure modes follow. First, every non-Claude host re-implements
the protocol parsing differently, so "the kit works the same in Cursor"
is a documentation claim, not a tested one. Second, after a run, the
only executed record is the final run state; the sequence of attempts,
rejections, and actor attributions in between is not durable.

## Decision

### 1. Host tiers — capability honesty, not host favoritism

| Tier  | Mechanism                           | Kit-side enforcement          | Status                                  |
| ----- | ----------------------------------- | ----------------------------- | --------------------------------------- |
| **A** | In-process hooks (Claude Code Mods) | Interception + evidence gate  | Shipped (ADR-0015, ADR-0020)            |
| **B** | External protocol (e.g. MCP)        | Tool-mediated + evidence gate | Not built; no claim made                |
| **C** | Rules file + terminal               | Evidence gate only            | Shipped (this ADR makes it contractual) |

The evidence gate (ADR-0018: persisted Red→Green→Refactor chains, task-
scoped verification, fail-closed classification) is already host-
independent: it depends on the filesystem and subprocesses, not on any
host runtime. This ADR makes that gate the _only_ path to `completed`
for every tier, and adds the missing host-facing surface.

Absence of a hook surface is a capability downgrade, never a policy
bypass (SECURITY.md §3.1). Tier C cannot prevent an agent from editing
files outside the loop; it CAN prevent that agent from producing a
`completed` feature without a valid evidence chain. That is the
guarantee the kit advertises.

### 2. `kit next` — one bounded, machine-readable protocol entry point

`kit next [feature-id] [--json]` answers, for the active feature run:
what to do next (`requiredAction`), against which target (`taskId`,
`phase`), with which verification command (`verificationCommand` — the
task's own command from the plan, ADR-0018 P1), under which constraints
(`timeoutMs`, `maxOutputBytes`), and the literal CLI invocation
(`nextInvocation`). The payload is the `NextAction` contract
(`contracts/src/workflow/next-action.ts`), schema-versioned per
CONTRACTS.md §9.

A Tier C host drives the whole workflow with one loop:

```
loop:
  action = kit next --json
  if action.requiredAction == 'run.completed': stop
  act (write test / implement / refactor)
  run action.nextInvocation
```

Derivation rules fail closed: a run state that exists but will not load
is an error, never a misleading `feature.start`; a plan that cannot be
loaded (state/plan divergence) is an error, never a guess;
`run.completed` requires a journaled passed `workflow.finalized` event,
and falls back honestly to `feature.verify` when no journal exists
(verification is idempotent, so the fallback is safe).

`blockingQuestions` is honest: empty means "the kit is not waiting on a
human", not "no question could ever matter". Tier C has no approval
surface today; when one exists, it surfaces here.

### 3. The execution journal — tamper-evident, append-only, never authority

Every feature-workflow transition appends an event to
`.ai-kit/journal/feature-runs/<featureId>.jsonl`:
`workflow.started`, `phase.recorded`, `phase.rejected`, `phase.failed`,
`workflow.finalized`. Each event carries `seq`, `prevHash`, and `hash`
(SHA-256 over the canonical serialization without `hash`); `kit journal
<id> --verify` recomputes the chain and reports the first violation.

Invariants:

- **The journal is observability, never authority.** An event never
  authorizes anything and never substitutes for evidence records; the
  run state's evidence chain decides phase advancement. Journal write
  failures never block the workflow (the run-observer invariant:
  telemetry must not block the chain).
- **Payload strings are redacted at the boundary** (the same policy as
  phase evidence), defensively re-applied on append.
- **Actors are declared, not inferred.** The kit cannot distinguish an
  agent from a human at the CLI boundary, so a host declares itself
  (`--host <id>` or `KIT_HOST`); undeclared invocations are recorded
  honestly as `{kind: 'human'}`. Mode 1 orchestration records
  `{kind: 'kit'}`.

Honest limits:

- Modification, insertion, and reordering of recorded events are
  detectable. **Tail truncation is not detectable from the journal
  alone** — a truncated file is still a valid chain. `verifyJournal`
  returns `lastHash` so callers can anchor it externally; anchoring is
  a follow-up, and the journal never claims more than it proves.
- Single-writer model: one kit process drives a run at a time. The CLI
  is the only mutation path today; concurrent writers may interleave.
- Mode 1 runs execute inside a git worktree, so their journal lands in
  the worktree, consistent with where the run state lives. If worktrees
  are discarded post-merge, that run's journal goes with them; whether
  Mode 1 journals should be redirected to the main root is an open
  question (same question already exists for the run state).
- `.ai-kit/journal/` is runtime data, gitignored like `.ai-kit/state/`:
  kit bookkeeping is never part of the reviewable agent footprint.

### 4. Advisory lessons — the type is in, the wiring is a follow-up

`NextAction.advisoryLessons` carries `LessonRef`s (`lessonId`, `summary`,
`advisory: true` — a literal, not a flag). The invariant mirrors the
model-router's: **a lesson is advice, never authority.** A lesson never
grants permission and never satisfies a phase invariant. This revision
emits an empty list — the honest state; recall wiring
(`{stack, phase, failureClassification}` → top-N, promotion-gated per
the existing distiller/hypothesis-engine discipline) is a follow-up.

### 5. Tier C conformance — "works the same" becomes a tested claim

`packages/testing/src/conformance/tier-c.ts` defines a driver interface
(start/next/runPhase/verify/journal/verifyJournal/applyImplementation)
and the golden trace: the exact protocol-state sequence a conforming
host must observe for a clean run. The harness imports only contracts;
every host- or kit-specific operation lives behind the driver.

The CLI proves its own conformance by running the golden trace through
the **real commands** (`packages/cli/src/commands/tier-c-conformance.test.ts`).
A future cursor-adapter or agy-adapter runs the same trace through its
own driver and must observe the same sequence — that test, passing in
CI, is what "cross-host parity" means from now on.

## Consequences

- Cursor/AGY/CI integration becomes a protocol dependency instead of a
  documentation dependency: `kit next --json` + `nextInvocation` +
  exit codes.
- The executed record survives the process: sequence, attempts,
  rejections, actor attributions, and final outcome, hash-chained.
- `packages/testing` gains a conformance surface while keeping its
  contracts-only import invariant (the driver pattern keeps all kit
  specifics on the driver side).
- Follow-ups opened by this ADR: journal tail-anchoring; Mode 1 journal
  destination; advisory-lesson recall wiring; Tier B (MCP) once a host
  surface is verified.
