# ADR-0020: Agent capability and permission boundary — one policy source, two enforcement points

Status: Accepted (v2 — supersedes the v1 text merged in PR #8; makes the policy mechanics explicit)
Date: 2026-11-20
Milestone: M36 — Agent Execution and Orchestration Foundation

## Context

ADR-0019 authorizes Kit to invoke AI agents through a provider-neutral
`AgentProvider` interface. The central question is not *how to call the
agent* but *how to bound what the agent can do once connected*.

An agent connected to Kit must not receive unrestricted authority merely
because it is connected. If the provider can execute arbitrary shell,
write anywhere on the filesystem, or run destructive operations without
approval, the policy and evidence architecture is defeated: an agent could
fabricate passing evidence by editing test outputs, or cause irreversible
damage by force-pushing, running migrations, or deploying.

The kit already has two partial enforcement layers:

- **Kit-level**: `core/verification/process-runner.ts` already implements
  `shell: false`, argument arrays, scoped `cwd`, bounded timeouts, and
  bounded output capture.
- **Runtime-level**: the Mods (`plugins/secret-guard`, `plugins/sdlc-guard`,
  `plugins/model-router`, `plugins/run-observer`) enforce inside a specific
  host runtime, with fail-closed deny paths (hardened in PRs #6/#7).

The v1 draft of this ADR stated the principle ("one policy source of
truth, two enforcement points") but left its mechanics undefined. The
review round required those mechanics to be explicit, and added a security
qualification the v1 draft understated. Both are adopted here.

## Decision

### 1. One canonical ExecutionPolicy

There is exactly **one** policy definition, in `packages/contracts`:

- A canonical `ExecutionPolicy` schema (capabilities, writable-path scope,
  approval requirements, budgets) plus a policy evaluator.
- Every execution receives a **normalized, versioned policy snapshot**.
- A stable **`policyHash`** (hash of the snapshot) is recorded in
  `AgentExecutionEvent`s and in verification evidence, so every decision
  and every artifact is traceable to the exact policy in force when it was
  produced.

### 2. Two enforcement points, both derived from the canonical policy

| Enforcement point | Mechanism |
| --- | --- |
| **Kit enforcement** (provider-neutral) | Process runner, filesystem scope, Git operations, approval checks |
| **Runtime enforcement** (host-specific) | Claude Code permissions, Mods, fail-closed tool hooks |

Critical rule: **runtime Mods consume a generated representation of the
canonical policy — they never maintain an independent policy definition.**
Two hand-maintained policy layers will drift; the drift will be found
during an incident, not before.

### 3. Policy parity tests

Contract tests verify that both enforcement points produce **equivalent
decisions** for identical policy inputs and identical requested
operations. A capability denied by the Kit evaluator must be denied by the
runtime representation, and vice versa. Parity failures are release
blockers.

### 4. Fail-closed on policy problems

Missing, malformed, or mismatched (wrong `policyHash`, stale snapshot)
policy configuration **fails closed** for protected operations: the
operation is denied, the denial is recorded, and the run explains what it
is waiting for. There is no configuration state in which an unbounded
operation proceeds.

### 5. Capability taxonomy (unchanged from the v1 text in PR #8)

`AgentCapability` is an allowlist: `repository.read`, `repository.write`,
`git.read`, `git.write`, `process.test`, `process.build`, `process.lint`,
`process.typecheck`, `network.access`, `external.approval`. "Execute
arbitrary shell" is **not** a capability and never will be. The provider
may only exercise capabilities explicitly granted in the request; the
enforcement layer authorizes each tool call against that set.

### 6. Tool execution rules (hardened in place before any extraction)

1. No model-generated arbitrary shell strings — allowlisted executable +
   argument array, never a shell string.
2. `shell: false` for all process execution.
3. Resolve and validate paths, including symlinks; writes restricted to
   the run's workspace.
4. Never expose environment secrets in agent context; agent output, tool
   arguments, external content, and retrieved memories are untrusted.
5. Bound execution: duration, output size, tool calls, budgets.
6. Persist verification evidence for each executed operation.
7. Human approval for deployments, releases, destructive operations,
   migrations with material risk, force pushes, and sensitive policy
   changes.
8. **Resume tokens are credentials**: never logged, never included in
   ordinary events; compromise of a resume token is treated as compromise
   of the execution.

### 7. Workspace isolation — with an honest security qualification

Autonomous implementation runs in a **dedicated git worktree per workflow
run** (`ExecutionWorkspace.kind: 'git-worktree'`), never in the
developer's active working tree. This isolates changes and gives the
orchestrator a clean diff for evidence.

**Qualification (added in v2):** a git worktree isolates repository
changes; it is **not an OS sandbox**. Mods running with host permissions
are **not a complete security boundary**. For a real provider, the agent
process must additionally run with restricted host permissions or in an
appropriately isolated process/container. **`bypassPermissions` must never
be used as an orchestration shortcut** — a provider configuration that
disables the runtime's permission system defeats this ADR and is rejected
by the provider adapter's configuration validation.

### 8. Budgets with honest enforcement levels

`ExecutionBudget` limits (duration, tool calls, input/output/total
tokens, estimated cost) are declared per execution. Each limit carries an
enforcement level from `AgentProviderCapabilities`:

- `provider-enforced` — the provider reliably enforces or reports it.
- `gateway-enforced` — Kit enforces it itself (always true for duration
  and process bounds: the gateway owns the process).
- `best-effort` — reported as such; execution evidence must state that the
  limit was not hard-enforced.

Token or monetary cost enforcement is **never claimed** where the provider
does not expose reliable usage information. Exceeding an enforced budget
is a `BUDGET_EXCEEDED` error, not silent continuation.

### 9. Evidence is authoritative

The agent's `proposedArtifacts` list is informational. Kit independently
inspects git status, modified paths, test command and exit status, test
output, verification configuration, approval records, and artifact
hashes. A workflow task completes only when its deterministic acceptance
conditions are met.

For TDD specifically, the targeted test must fail (Red) / pass (Green /
Refactor) for the **expected reason**. A whole-suite failure, a
compilation failure, an environment failure, an unrelated regression, or
a malformed test must be distinguished from an expected assertion
failure. Failure classification (assertion vs compilation vs dependency
vs discovery vs environment vs timeout vs unclassified) landed as the
task-scoped Red-evidence fix — PR #9 (ADR-0018, P1 refinement) — which
runs `task.verification.command` in `runTddPhase`, classifies the
observed failure, and accepts only classification `assertion` as Red.
**An unclassified failure never counts as Red.**

## Consequences

- A canonical `ExecutionPolicy` schema and evaluator land in
  `packages/contracts` / policy modules; Mods read a generated
  representation (their hand-maintained policy fragments are retired as
  the generator lands).
- Parity tests become part of the release gate for both enforcement
  points.
- The provider adapter (PR 4) validates its host-runtime permission
  configuration at startup and refuses to run with `bypassPermissions`.
- The tool broker remains a hardening of the existing process runner until
  extraction is warranted (ADR-0019 §4).
- CLSE connects only to provenance-backed evidence (`policyHash`-stamped)
  produced under this boundary.

## Five decisions explicitly rejected

1. Making the CLI itself an LLM.
2. Letting providers execute arbitrary shell.
3. Making every task a separate autonomous agent.
4. Treating a provider's `completed` response as workflow completion.
5. Expanding CLSE before reliable agent execution.

## References

- ADR-0019 — hybrid execution model (this boundary secures that model).
- ADR-0018 — evidence-gated TDD.
- `docs/security/SECURITY.md` §1 — no false assurance.
- `packages/contracts/src/agent/capability.ts` — the capability allowlist (v1 in PR #8, unchanged).
