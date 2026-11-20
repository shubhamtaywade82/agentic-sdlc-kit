# ADR-0020: Agent capability and permission boundary

Status: Accepted
Date: 2026-11-20
Milestone: M36 — Agent Execution and Orchestration Foundation

## Context

ADR-0019 authorizes Kit to invoke AI agents through a provider-neutral
`AgentProvider` interface. The immediate question is not _how to call the
agent_ but _how to bound what the agent can do once connected_.

An agent that is connected to Kit must not receive unrestricted authority
merely because it is connected. If the provider can execute arbitrary
shell, write anywhere on the filesystem, or run destructive operations
without approval, then the entire policy and evidence architecture is
defeated: an agent could fabricate passing evidence by editing test
outputs, or cause irreversible damage by force-pushing, running
migrations, or deploying.

The kit already has one enforcement layer — the runtime Mods
(`plugins/secret-guard`, `plugins/sdlc-guard`, `plugins/model-router`,
`plugins/run-observer`) — which enforce inside a specific host runtime
(Claude Code). That layer is host-specific. A provider-neutral boundary is
needed so that policy is defined once and enforced at every execution
surface, regardless of which provider runs.

`packages/core/src/verification/process-runner.ts` already implements the
core execution safety properties: `shell: false`, argument arrays, scoped
`cwd`, bounded timeouts, and bounded output capture. The tool broker is
the generalization of that discipline to all agent-initiated operations,
plus capability scoping, path validation, and approvals.

## Decision

Agent authority is **capability-based**, enforced by a **tool broker** that
is the single security boundary between an agent and the execution
environment. The agent proposes an operation; the tool broker authorizes
and executes it.

### Capability taxonomy

`AgentCapability` is an allowlist (see
`packages/contracts/src/agent/capability.ts`):

```
repository.read | repository.write | git.read | git.write |
process.test | process.build | process.lint | process.typecheck |
network.access | external.approval
```

"Execute arbitrary shell" is **not** a capability and never will be. The
provider may only exercise capabilities the orchestrator explicitly grants
in `AgentExecutionRequest.permissions.capabilities`, and the tool broker
authorizes each tool call against that set.

### Tool broker rules

1. **No model-generated arbitrary shell strings.** Process execution uses
   an allowlisted executable and an argument array, never a shell string.
2. **`shell: false`** for all process execution (already enforced in
   `process-runner.ts`).
3. **Resolve and validate paths**, including symlinks. Writable paths are
   restricted to the run's isolated workspace (worktree).
4. **Never expose environment secrets** in agent context. Agent output,
   tool arguments, external content, and retrieved memories are treated as
   untrusted.
5. **Bound execution**: time, output size, tool-call count, and token
   budget (`maxToolCalls`, `maxDurationMs`, `maxTokens`). Exceeding the
   token budget is a `BUDGET_EXCEEDED` error, not silent continuation.
6. **Persist verification evidence** for each executed operation.
7. **Require human approval** for deployments, releases, destructive
   operations, migrations with material risk, force pushes, and sensitive
   policy changes.

### Workspace isolation

Autonomous implementation runs in a **dedicated git worktree per workflow
run**, not in the developer's active working tree. This avoids conflicting
changes and gives the orchestrator a clean diff to inspect for evidence.

### One policy source of truth, two enforcement points

Policy is defined once (capability grants + approval requirements in
`AgentExecutionRequest` and the project policy) and enforced at two
points:

- **Tool broker** — provider-neutral, Kit-level. Authorizes every
  agent-initiated operation regardless of provider.
- **Runtime Mods** — host-specific, inside a provider's runtime (e.g.
  Claude Code hooks). The fail-closed deny paths established in PR #6 are
  exactly this enforcement point.

The two points must read the **same** capability/policy definition, or
they will drift. The Mods are runtime-specific integrations, not the
primary orchestration engine; the tool broker is primary.

### Budgets and abort

Every execution carries explicit bounds. `AbortSignal` is passed to
`execute()`/`resume()`; a signal already aborted yields a `cancelled`
result, not a hang. A timeout yields `timed_out`. Neither may be reported
as `completed`. An interrupted execution is recoverable only when the
provider supports safe session resumption or the workflow can safely
restart the task; resume must not repeat irreversible side effects.

### Evidence is authoritative

The agent's `proposedArtifacts` list is informational. Kit independently
inspects git status, actual modified paths, test command and exit status,
test output, verification configuration, approval records, and artifact
hashes. A workflow task is complete only when its deterministic acceptance
conditions are met — never because the agent said so.

For TDD specifically, the targeted test must fail (Red) / pass (Green /
Refactor) for the **expected reason**. A whole-suite failure, a
compilation failure, an environment failure, an unrelated regression, or a
malformed test must be distinguished from an expected assertion failure.
This is a follow-up to this ADR (separate PR) and hardens the existing
`Task.verification` contract, which already declares a per-task command
and `expectedStatus` but is not yet consumed by `runTddPhase`.

## Consequences

- The tool broker begins as a hardening of `core/verification/process-runner`
  (allowlisted executables, path scope, approval gate) and is promoted to
  its own package when a second provider needs it.
- `AgentExecutionRequest.permissions` is the authoritative grant; providers
  MUST NOT exceed it. The tool broker rejects out-of-grant operations.
- Approval-required actions block with `needs_approval` rather than
  prompting silently; a blocked run explains what it is waiting for.
- CLSE (M37+) connects only to provenance-backed execution evidence
  produced under this boundary. Learning from unverified execution would
  poison it.

## Five decisions explicitly rejected

1. Making the CLI itself an LLM — blurs deterministic and probabilistic
   responsibilities.
2. Letting providers execute arbitrary shell — defeats the policy and
   security architecture.
3. Making every task a separate autonomous agent — adds coordination
   overhead before the execution foundation is proven.
4. Treating a provider's `completed` response as workflow completion —
   creates false positives.
5. Expanding CLSE before reliable agent execution — learning from
   incomplete or fabricated evidence makes the system worse.

## References

- ADR-0019 — hybrid execution model (this boundary secures that model).
- ADR-0018 — evidence-gated TDD (the invariants the tool broker preserves).
- `docs/security/SECURITY.md` §1 — no false assurance.
- `packages/contracts/src/agent/capability.ts` — the capability allowlist.
