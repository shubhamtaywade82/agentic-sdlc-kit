# ADR-0019: Hybrid execution model — additive agent orchestration around the existing deterministic workflow engine

Status: Accepted (v2 — supersedes the v1 text merged in PR #8; applies contract revisions A–D)
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
is an invariant violation.

That machinery is **Mode 2** (agent-led): an external agent drives the work
and invokes `kit feature <id> red|green|refactor` between implementation
steps. What is missing is **Mode 1** (kit-orchestrated): Kit itself
initiating and coordinating agent execution.

Two facts about the current repository make this the right moment:

1. `packages/claude-code-adapter` is a **boundary declaration, not an
   integration** — its barrel states *"M1: this package is a BOUNDARY
   DECLARATION, not a working integration. The host SDK is NOT imported.
   M10 wires the SDK against these contracts."* M10 never shipped in that
   shape.
2. `docs/architecture/ARCHITECTURE.md` is frozen at M0/M1 while the
   repository is at 0.8.0 with milestones through M35.

A review round on the v1 draft of this ADR produced one essential
correction, which this v2 adopts as its central principle:

> **Hybrid does not mean building a new SDLC engine. It means adding agent
> execution around the existing deterministic workflow engine.**

This changes both the implementation scope and the risk profile. The
existing TDD evidence gates remain authoritative. Neither interaction mode
owns a separate implementation of workflow logic.

## Decision

### 1. Product direction: C — Hybrid, precisely defined

- **Mode 2 (existing, preserved):** the CLI-driven phase workflow. An
  external agent (or a developer) drives `kit feature <id>
  start|red|green|refactor|status|verify`. Kit verifies evidence and gates
  transitions. This surface does not change semantics.
- **Mode 1 (new, additive):** provider-backed agent execution. `kit feature
  <id> run` loads the spec and plan, creates a persisted run and an
  isolated workspace, invokes a configured agent through a provider
  adapter, and validates each phase against the **same** TDD state machine.
- The deterministic core stays authoritative. Mode 1 is an orchestration
  layer over existing core workflow APIs — not a parallel engine.
- One workflow engine, one contract set, one policy model, one evidence
  model. The two modes must not become two implementations.
- The CLI stays useful without AI: `kit verify` works in CI with no model
  key; `kit feature <id> run` with no configured provider fails with
  `AGENT_PROVIDER_NOT_CONFIGURED` and never pretends a manual workflow
  completed.

### 2. Two integration directions — never conflated

| | Host adapter (existing) | Provider adapter (new) |
| --- | --- | --- |
| Direction | agent → Kit | Kit → agent |
| Mechanism | Claude Code invokes Kit commands, tools, Mods | Kit starts the agent headless, manages execution, normalizes results |
| Mode | Mode 2 | Mode 1 |
| Repository home | `packages/claude-code-adapter` (retains this role) | new module, later possibly its own package |

These are **inverse integration boundaries with different
responsibilities**. The existing `claude-code-adapter` must NOT silently
become both. It retains its host-adapter role; its stale M10 comments are
updated to state exactly that. The provider adapter is built separately,
against the contracts in this ADR.

### 3. Agent execution contract (v2)

All contracts live in `packages/contracts/src/agent/`. Design rules carried
over from v1: provider-neutral requests; `proposedArtifacts` informational
(Kit derives truth from git); timeouts/cancellations/crashes reported with
matching status, never `completed`; core never imports a provider SDK.

Four amendments adopted from the review round:

#### A. The gateway persists the original request; execution is handle-based

The provider never receives the full request again during resume — that
would permit the workspace, instructions, or permissions to change across
execution attempts.

```ts
interface AgentProvider {
  readonly id: string;
  capabilities(): Promise<AgentProviderCapabilities>;
  start(request: AgentExecutionRequest, signal: AbortSignal): Promise<AgentExecutionHandle>;
  resume(executionId: string, resumeToken: string): Promise<AgentExecutionHandle>;
  cancel(executionId: string): Promise<void>;
  healthCheck(): Promise<AgentProviderHealth>;
}
```

The gateway owns the original request, the execution identity, and the
provider-session mapping; `resume` references the persisted execution
only. **Resume tokens are credentials**: they are never logged and never
included in ordinary events.

Handle shape (finalized in `packages/contracts/src/agent/provider.ts`):

```ts
interface AgentExecutionHandle {
  readonly executionId: string;
  /** Final result; rejects only on transport-level failure. */
  result(): Promise<AgentExecutionResult>;
  /** Lifecycle event subscription; returns an unsubscribe fn. Observability only. */
  events(onEvent: (event: AgentExecutionEvent) => void): () => void;
}
```

#### B. Explicit workspace identity

The request references a workspace; it never assumes the current process
directory is the execution environment.

```ts
interface ExecutionWorkspace {
  id: string;
  kind: 'git-worktree' | 'container' | 'directory';
  rootPath: string;
  branch: string;
  baseCommitSha: string;
  createdAt: string;
}
```

#### C. Enforceable execution budgets with honest enforcement levels

```ts
interface ExecutionBudget {
  maxDurationMs: number;
  maxToolCalls: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxTotalTokens?: number;
  maxEstimatedCost?: { amount: number; currency: string };
}
```

A budget is meaningful only when the provider can enforce or report it.
`AgentProviderCapabilities` declares, per limit, whether it is
`provider-enforced`, `gateway-enforced`, or `best-effort`. Token or
monetary cost enforcement must never be claimed where the provider does
not expose reliable usage information. The gateway always enforces
duration and process bounds itself (it owns the process), regardless of
what the provider claims.

#### D. Mandatory event sequence numbers; gateway-persisted, idempotent replay

```ts
interface AgentExecutionEvent {
  eventId: string;
  executionId: string;
  sequence: number;   // monotonic per execution; gaps/duplicates are detectable
  type: string;
  occurredAt: string;
  policyHash: string; // correlates the event to the policy snapshot in force
  payload: Record<string, unknown>;
}
```

The gateway persists events and makes replay idempotent. `policyHash` ties
every event to the canonical policy snapshot (ADR-0020). Payloads are
typed per event kind in the Zod contracts (discriminated on `type`) while
keeping this envelope shape stable for persistence.

### 4. Package strategy: no new packages in the first slice

The first implementation slice introduces **no new packages**. Package
boundaries follow proven responsibilities, not architectural diagrams.

- **Agent gateway** — begins as an isolated module within the existing CLI
  application layer (`packages/cli/src/application/`).
- **Orchestrator** — begins as a module within the same layer, coordinating
  existing core workflow APIs.
- **Tool execution** — harden the existing `core/verification/process-runner`
  (allowlisted executables, path scope, approvals) in place; extract a
  `tool-broker` package only when a second provider or another consumer
  establishes the need.
- **Provider integration** — exactly one provider (Claude Code, headless),
  after contract and security validation.
- **CLSE** — no expansion until actual execution evidence is trustworthy.

### 5. M36 implementation sequence

| PR | Scope | Acceptance criterion |
| --- | --- | --- |
| PR 1 — Task-scoped TDD evidence (P0) | Task-targeted test execution; failure classification; reject unrelated/environment failures as Red; regression tests for the existing phase machine | Mode 2 cannot advance Red based on an unrelated failure |
| PR 2 — Agent contracts + ADRs (P0) | ADR-0019/0020; Zod request/result/session/event contracts; provider capabilities and budgets; `AgentProvider` interface; mock-provider contract tests. No provider SDK, no new package | Provider behavior testable independently of provider infrastructure |
| PR 3 — Mock-backed orchestration (P0) | Gateway + orchestration modules within the existing CLI application; drive the existing TDD state machine; persist execution and workflow identities; cancellation and resumable state; `kit feature ID run` | An integration test completes a simulated feature lifecycle through the mock provider without duplicating core workflow logic |
| PR 4 — Secure Claude Code provider (security-critical) | Headless invocation; worktree-per-run; shared policy snapshot; runtime Mods enforcement; provider permission configuration; timeout/cancellation/output handling; real-provider smoke tests | A real provider executes a bounded task without bypassing the approved policy |
| PR 5 — End-to-end feature proof (release gate) | One real feature; actual Red/Green/Refactor recorded; independent Git-diff verification; evidence-backed completion report; Mode 1 vs Mode 2 comparison | Both modes use the same core state machine and produce equivalent evidence |

PR 1 and PR 2 are independently reviewable and may proceed in either
order; they touch disjoint files. (PR 2 corresponds to the contracts
merged in PR #8, revised to v2 per this ADR.)

### 6. Non-negotiable rules

1. `packages/core` never imports a provider SDK; agent-specific behavior
   lives behind `AgentProvider` adapters. (Architecture gate.)
2. A provider `completed` result is never sufficient to mark a workflow
   task complete. Completion requires Kit's independent evidence check
   (ADR-0018).
3. The CLI remains useful without AI.
4. One policy source of truth, two enforcement points (ADR-0020).
5. Never `bypassPermissions` as an orchestration shortcut (ADR-0020).

## Consequences

- The `claude-code-adapter` retains its host-adapter role; its M10 comments
  are corrected to state that the SDK wiring assumption is superseded by
  this ADR, and that the provider adapter is a separate boundary.
- The v1 contract text merged in PR #8 is revised per §3 A–D: the
  `execute()`-returns-result interface becomes `start()`-returns-handle;
  `ExecutionWorkspace` and `ExecutionBudget` are added; the event envelope
  gains `eventId`/`sequence`/`occurredAt`/`policyHash`; the request carries
  `policyHash` so providers can echo it in every event.
- `docs/architecture/ARCHITECTURE.md` and `docs/workflows/WORKFLOWS.md` are
  updated to document both modes and both integration directions.
- Package extraction (`agent-gateway`, `orchestrator`, `tool-broker`) is
  deferred until proven responsibilities demand it.

## References

- ADR-0018 — evidence-gated TDD (the foundation).
- ADR-0020 — capability and permission boundary; canonical policy and parity.
- `packages/contracts/src/agent/` — the contracts this ADR authorizes.
