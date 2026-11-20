# ADR-0019: Hybrid execution model — kit-orchestrated and agent-led modes over one workflow engine

Status: Accepted
Date: 2026-11-20
Milestone: M36 — Agent Execution and Orchestration Foundation
Supersedes: the stale "M10 wires the host SDK" assumption in `docs/architecture/ARCHITECTURE.md` and `packages/claude-code-adapter/src/index.ts`

## Context

ADR-0018 established evidence-gated TDD as the kit's core discipline: the
agent writes tests and code; the workflow runs real verification, records
evidence into persisted run state, and advances the TDD state machine only
when the phase invariant holds. `runTddPhase` already enforces the
invariants — a dry run cannot produce evidence, a vacuous report (zero
executed checks) is rejected, and a Red phase where the test already passes
is an invariant violation, not a success.

That machinery is **Mode 2**: an external agent (Claude Code, Codex, …)
drives the work and invokes `kit feature <id> red|green|refactor` between
implementation steps. The CLI surface today is exactly
`start|red|green|refactor|status|verify`.

What is missing is **Mode 1**: Kit itself initiating and coordinating agent
execution — `kit feature <id> run --agent <provider>` — so that a single
command loads the spec and plan, creates a persisted run, invokes a
configured agent within a bounded permission scope, and independently
verifies the result against the same TDD state machine.

Two facts about the current repository make this the right moment to fix
the boundary:

1. `packages/claude-code-adapter` is a **boundary declaration, not an
   integration**. Its barrel states: _"M1: this package is a BOUNDARY
   DECLARATION, not a working integration. The host SDK is NOT imported.
   M10 wires the SDK against these contracts."_ M10 never shipped in that
   shape. The assumption that an SDK would be wired later is now stale.
2. `docs/architecture/ARCHITECTURE.md` is frozen at M0/M1 ("Status: M0
   frozen … for release 0.1") and still describes "Codex and others via
   M18 adapters". The repository is at 0.8.0 with milestones through M35.

There are three things that must not be conflated:

- **AI agent** — intelligence: understands requirements, reasons, writes
  code, fixes bugs, makes engineering decisions.
- **Agentic SDLC Kit** — control and governance: manages workflow state,
  provides repository information, runs verification, enforces permissions
  and approvals, records evidence, prevents invalid transitions.
- **Development environment** — execution: git, filesystem, compilers,
  test runners, sandboxes, CI.

The kit is not the AI. A deterministic CLI cannot independently understand
arbitrary requirements, design a solution, and implement a feature. It can
execute a predetermined procedure, generate boilerplate, and run tests —
that is not autonomous software engineering, and pretending otherwise is
exactly the misleading-workflow failure mode ADR-0018 rejected.

## Decision

The kit is a **deterministic engineering control plane** that gives AI
agents the tools, workflows, and governance needed to deliver verified
software. It supports two operating modes over **one** workflow engine,
**one** set of contracts, **one** policy model, and **one** evidence
model. The two modes must not become two implementations.

### Mode 1 — Kit-orchestrated (the missing capability)

`kit feature <id> run --agent <provider>` loads and validates the
specification and plan, creates a persisted workflow run, creates an
isolated workspace, invokes a configured agent through an adapter, and
independently verifies each phase. `kit feature <id> run` with no
configured provider fails with `AGENT_PROVIDER_NOT_CONFIGURED`. It must
never fall back to pretending that a manual workflow completed.

### Mode 2 — Agent-led (already present)

A developer works directly with Claude Code, Codex, or another agent; that
agent invokes `kit inspect`, `kit validate-spec`, `kit validate-plan`,
`kit verify`, and `kit feature <id> red|green|refactor` to validate its
work. Mode 2 is already close to the current feature workflow's operating
style.

### The agent execution contract

Agent execution is expressed through a provider-neutral, capability-scoped,
resumable, observable, and independently verifiable contract (see
`packages/contracts/src/agent/`):

- `AgentExecutionRequest` — provider-neutral. Carries the task kind,
  instructions, context (project root, spec/plan refs, relevant files,
  constraints), a capability-scoped permission grant, a session ref, and
  an approval policy. It carries **no** provider-specific fields (no model
  name, no prompt-template id). Provider selection is the gateway's job.
- `AgentExecutionResult` — status (`completed | failed | cancelled |
timed_out | interrupted | needs_approval`), summary, informational
  `proposedArtifacts`, `requestedApprovals`, usage, and a typed error
  list. `proposedArtifacts` is **informational**: it is what the agent
  claims it changed. Kit derives truth from git, not from this list.
- `AgentExecutionEvent` — a normalized, discriminated-union lifecycle
  stream with per-execution sequence numbers. Events are **observability,
  not control**: a `tool.requested` event does not authorize the tool; an
  `execution.completed` event does not complete the workflow task.
- `AgentProvider` — the behavior interface (`capabilities`,
  `healthCheck`, `execute`, `resume`, `cancel`).

### Resume shape

`resume(executionId, resumeToken, signal, onEvent?)` — not
`resume(request, signal)`. The gateway persists the original request, so
the provider does not need it re-passed. Re-passing the full request
invites drift between the persisted request and the resubmitted one.

### Non-negotiable rules

1. `packages/core` must never import a Claude, Codex, OpenAI, Anthropic,
   or other provider SDK. Agent-specific behavior lives behind
   `AgentProvider` adapters. (Enforced by `scripts/check-architecture.ts`.)
2. A provider `completed` result is never sufficient to mark a workflow
   task complete. Completion requires Kit's independent evidence check
   (ADR-0018). A timeout, cancellation, or provider crash must be reported
   with the matching status, never `completed`.
3. The CLI must remain useful without AI. `kit verify` works in CI with no
   model key; `kit feature <id> run` requires a configured provider.
4. One policy source of truth, two enforcement points — see ADR-0020.

### What stays deterministic

Repository inspection, spec/plan schema validation, workflow state
transitions, TDD phase evidence validation, command execution and
verification, approval decisions, policy enforcement, git diff collection,
and evidence integrity.

### What uses AI

Requirements discovery, architecture analysis, implementation planning,
test design and code implementation, debugging, code review, CLSE
hypothesis generation. Do not create a separate agent per responsibility
yet — define roles as task kinds and prompt profiles; one capable agent
can perform multiple roles. Independent review is a separate invocation
when risk warrants.

## Consequences

- The `claude-code-adapter` package is repurposed from a boundary
  declaration to a real `AgentProvider` adapter (M36 Phase 1), or renamed
  as a host integration. Its "M10 wires the SDK" comment is removed.
- `docs/architecture/ARCHITECTURE.md` is rewritten to describe both modes
  and the agent execution boundary (M36 Phase 0, P1 doc update).
- New packages arrive incrementally: `agent-gateway` and one provider
  package first; `orchestrator` drives the existing TDD state machine;
  `tool-broker` begins as a hardening of `core/verification/process-runner`
  and is promoted to its own package when a second provider needs it.
- `kit feature <id> run` becomes the Mode 1 entry point; the existing
  `start|red|green|refactor|status|verify` surface is preserved unchanged
  for Mode 2.
- The first acceptance scenario (M36 Phase 3) is one real feature executed
  end-to-end with genuine Red → Green → Refactor evidence, plus a failure
  scenario where an agent timeout after file modification is preserved as
  `interrupted`, never as `completed`.

## References

- ADR-0018 — evidence-gated TDD and honest reporting (the foundation this
  builds on).
- ADR-0020 — agent capability and permission boundary (the security model
  for agent execution).
- `packages/contracts/src/agent/` — the contracts this ADR authorizes.
- `docs/contracts/CONTRACTS.md` — schema and round-trip conventions.
