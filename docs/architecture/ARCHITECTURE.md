# ARCHITECTURE.md — Agentic SDLC Kit

Status: M0 frozen. System boundaries and component architecture for release 0.1
(M0 + M1). Boundary changes require an ADR.

## 1. System boundaries

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Host Runtime                                  │
│   (Claude Code in M1; Codex and others via M18 adapters)             │
│                                                                       │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │              Claude Code Adapter (packages/)                │    │
│   │   contracts/  events/  middleware/                           │    │
│   │   Translates host events <-> core contracts. NO host APIs   │    │
│   │   leak below this line.                                      │    │
│   └────────────────────────────────────────────────────────────┘    │
│                                  ▲                                    │
└──────────────────────────────────┼──────────────────────────────────┘
                                   │ contracts only
┌──────────────────────────────────┼──────────────────────────────────┐
│                                  ▼                                    │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │   CORE (packages/core)  — runtime-independent               │    │
│   │   discovery/  workflows/  project-profile/  artifacts/      │    │
│   │   policy/  verification/                                    │    │
│   └────────────────────────────────────────────────────────────┘    │
│                                  ▲                                    │
│                                   │ contracts only                    │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │   CLI (packages/cli) — uses core + contracts                 │    │
│   │   commands/  application/  output/                           │    │
│   └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │   TESTING (packages/testing) — uses contracts                │    │
│   │   fixtures/  assertions/  validators/  helpers/              │    │
│   └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │   CONTRACTS (packages/contracts) — depended on by everyone;  │    │
│   │   depends on nothing.                                        │    │
│   │   project/  workflow/  specification/  planning/             │    │
│   │   verification/  policy/  common/  index.ts                  │    │
│   └────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

## 2. Component responsibilities

### 2.1 `packages/contracts`

**Role:** The single source of truth for shared types and zod schemas.

**Rules:**

- Imports nothing from sibling packages.
- Every public type is exported from `src/index.ts`.
- Every zod schema is exported alongside its inferred type.
- Schemas are versioned by `schemaVersion` where persistent.

**Public surface (M1):**

- `common/result.ts` — `Result<T, E>`, `ok`, `err`.
- `common/errors.ts` — `KitError`, `KitErrorCode`, error helpers.
- `project/project-profile.ts` — `ProjectProfile`, `ProjectProfileSchema`.
- `workflow/workflow.ts` — `WorkflowMode`, `WorkflowStatus`, `WorkflowState`.
- `specification/specification.ts` — `FeatureId`, `SpecificationSection`.
- `planning/task.ts` — `TaskId`, `Task`, `DependencyEdge`.
- `verification/report.ts` — `VerificationReport`, `CheckStatus`, `Check`.
- `policy/policy.ts` — `PolicyDecision`, `PolicyAction`, `Approval`.
- `index.ts` — barrel.

### 2.2 `packages/core`

**Role:** Runtime-independent application logic — the workflow engine,
project-profile generator, artifact writer, policy evaluator, and
verification orchestrator.

**Rules:**

- Imports only from `@agentic-sdlc-kit/contracts`.
- Never imports from `@anthropic-ai/*`, `claude-code-adapter`, or any host
  SDK.
- Provides pure functions wherever practical; side effects are isolated to
  the `artifacts/` and `verification/` modules.

**M1 surface (minimal, not placeholder):**

- `discovery/repository-scanner.ts` — interface and a no-op default
  implementation that future milestones will replace with real detection.
- `project-profile/generator.ts` — produces a `ProjectProfile` from a
  `RepositoryScan` (M2 fills the scan).
- `project-profile/validator.ts` — validates a profile against the zod
  schema; throws `KitError` with structured code on failure.
- `workflows/engine.ts` — `WorkflowEngine` interface and a state-transition
  table for `WorkflowStatus`. No orchestration logic yet.
- `artifacts/writer.ts` — writes JSON and Markdown artifacts to
  `.ai-kit/state/` and `docs/`.
- `policy/evaluator.ts` — pure `evaluate(action, policy): PolicyDecision`.
- `verification/runner.ts` — interface for executing structured commands
  (`shell: false`, argument arrays, bounded timeouts). The M1 implementation
  supports dry-run only; full execution lands in M6.

### 2.3 `packages/cli`

**Role:** The user-facing entry point. `kit <command>`.

**Rules:**

- Imports from `@agentic-sdlc-kit/core` and `@agentic-sdlc-kit/contracts`.
- Each command is a separate module under `src/commands/` and implements a
  `Command` interface.
- The dispatcher in `src/application/dispatcher.ts` is the only place that
  knows the full command list. Adding a command = adding one file and one
  registry entry.

**M1 commands (working, not placeholders):**

- `kit --version` — prints `0.1.0` from `package.json`.
- `kit --help` / `kit help` — lists commands.
- `kit doctor` — checks Node version, pnpm version, and that every workspace
  package builds. Reports a structured result.

### 2.4 `packages/testing`

**Role:** Shared test utilities for the kit's own tests (and for fixture
assertions later).

**Rules:**

- Imports only from `@agentic-sdlc-kit/contracts` and `vitest`.
- Provides reusable fixtures, assertions, validators, helpers, and the
  host conformance harness.

**M1 surface:**

- `fixtures/project-profile.ts` — sample valid and invalid profiles.
- `fixtures/repository-scan.ts` — sample scans for unit tests.
- `assertions/result.ts` — `assertOk`, `assertErr`.
- `validators/contracts.ts` — round-trip validators for every zod schema.
- `helpers/temp-dir.ts` — creates and cleans up temp directories.

### 2.5 `packages/claude-code-adapter`

**Role:** The architectural boundary between the host runtime (Claude Code)
and the runtime-independent core.

**Rules:**

- Imports from `@agentic-sdlc-kit/contracts` and (in M10+) Claude Code
  plugin APIs.
- Exports adapter contracts (`RuntimeEvent`, `RuntimeDecision`) that the
  core understands, plus middleware that translates host events to those
  contracts.
- **The core never imports from this package.**

**M1 surface (intentionally minimal boundary):**

- `contracts/runtime-event.ts` — `RuntimeEvent` union (lifecycle, tool-call,
  model-request, verification). No Claude Code SDK import in M1.
- `events/translator.ts` — interface for `translateHostEvent(event):
RuntimeEvent`. Concrete implementation lands with M10.
- `middleware/approval-gate.ts` — interface only. Wired in M10.

The M1 adapter is a **boundary declaration**, not a working integration.
This is by design and is documented in ADR-0005. The package is not
presented as a working feature; it is the contract surface future milestones
implement against.

## 3. Data flow

### 3.1 Init / inspect flow (M2+)

```
Host event ─▶ adapter ─▶ core.discovery ─▶ RepositoryScan
                                              │
                                              ▼
                                  core.project-profile.generator
                                              │
                                              ▼
                                    ProjectProfile (validated)
                                              │
                                              ▼
                                  core.artifacts.writer
                                              │
                                              ▼
                                    .ai-kit/project.yml
```

### 3.2 Verify flow (M6+)

```
ProjectProfile.commands ─▶ core.verification.runner
                                       │
                                       ▼
                              VerificationReport
                                       │
                                       ▼
                              .ai-kit/reports/verify/<runId>.json
```

### 3.3 Approval flow (M10+)

```
ProposedAction ─▶ core.policy.evaluator ─▶ PolicyDecision
                                                  │
                                                  ▼
                          adapter.middleware.approval-gate
                                                  │
                                                  ▼
                              host-side approval (allow / deny)
```

## 4. Trust boundaries

| Boundary               | What is trusted on each side                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Host runtime ↔ adapter | Host emits lifecycle events. Adapter is trusted to translate them faithfully; core does not trust the host.   |
| Adapter ↔ core         | Adapter produces `RuntimeEvent` values that conform to the contract. Core validates them at the boundary.     |
| Core ↔ CLI             | CLI is trusted to call core functions with valid arguments. Core still validates against zod schemas.         |
| Core ↔ filesystem      | Core writes only under `.ai-kit/` and `docs/`. Any write outside those roots requires explicit user approval. |
| Core ↔ subprocess (M6) | Verification commands are executed with `shell: false`, argument arrays, scoped cwd, bounded timeouts.        |

## 5. Extension points (M18 ready, M1 declared)

| Extension       | Mechanism                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------- |
| Stack pack      | Drop a directory under `stack-packs/<name>/` with a `manifest.json` declaring compatibility.    |
| Skill           | Markdown file under `plugins/skills/<name>/SKILL.md` with a `manifest` block.                   |
| Agent           | Markdown file under `plugins/agents/<name>/AGENT.md` declaring required capabilities.           |
| Command         | A module under `packages/cli/src/commands/<name>.ts` implementing the `Command` interface.      |
| Validator       | A module under `packages/testing/src/validators/<name>.ts` exporting a `Validator<T>`.          |
| Policy pack     | A directory under `plugins/policies/<name>/` exporting `Policy[]`.                              |
| Runtime adapter | A new package under `packages/<runtime>-adapter/` mirroring the `claude-code-adapter` boundary. |

The extension API itself is finalized in M18. M1 only declares the contract
surface so that later milestones do not have to refactor the core.

## 6. Architectural invariants (must not be violated without an ADR)

1. `contracts` imports nothing.
2. `core` imports only from `contracts`.
3. `cli` imports from `core` and `contracts`.
4. `testing` imports from `contracts` (and dev-deps).
5. `claude-code-adapter` imports from `contracts`; the host SDK import lives
   inside this package only.
6. No package imports from a sibling's `dist/`; cross-package imports go
   through the source via the workspace package name.
7. No timestamp or random ID is emitted into a build artifact.
8. No destructive operation is performed without an explicit approval.
9. `*.test.ts` files (and `test-*.ts` test-support files) may additionally
   import `@agentic-sdlc-kit/testing` (PR3, ADR-0019 §4): the runtime
   surface keeps its discipline; tests use the shared fixtures and the
   canonical mock provider.
10. `packages/core` never imports a provider SDK; agent execution lives
    behind the `AgentProvider` interface (ADR-0019 §6).

These invariants are enforced by:

- ESLint `no-restricted-imports` rule (added in M1-09).
- A `scripts/check-architecture.ts` script (M1-11) that fails CI if any
  invariant is violated.
- Tests in `packages/testing` that import every public symbol and fail if
  the dependency graph has cycles.

## 7. Agent execution modes (M36, ADR-0019)

The kit has two interaction modes around ONE deterministic workflow
engine — they never become two implementations:

| | Mode 2 — agent-led (existing) | Mode 1 — kit-orchestrated (PR3+) |
| --- | --- | --- |
| Who drives | An external agent (or developer) between steps | Kit itself, end to end |
| Entry | `kit feature <id> start\|red\|green\|refactor\|verify` | `kit feature <id> run --provider <id>` |
| Engine | `packages/core` TDD state machine (authoritative) | The SAME state machine — the orchestrator only coordinates |
| Evidence | Persisted per phase by `runTddPhase` | Identical store, written by the same functions inside an isolated git worktree |
| Agent role | Writes tests/implementations between invocations | Executes bounded per-phase tasks through a provider |

Mode 1 lives in `packages/cli/src/application/agent/` (ADR-0019 §4 — no
new packages until proven responsibilities demand extraction):

- `gateway.ts` — the `AgentGateway`: freezes the original request and the
  canonical policy snapshot per execution (ADR-0020 §1), persists events
  idempotently with fail-closed `policyHash` checks (rev D), enforces the
  duration and tool-call budgets itself, validates result correlation,
  and holds resume tokens in memory ONLY (they are credentials).
- `workspace.ts` — git-worktree-per-run isolation (ADR-0020 §7). A
  worktree isolates repository changes; it is NOT an OS sandbox.
- `orchestrator.ts` — derives the next pending task/phase from the
  feature run state (the authority), invokes the provider, and lets
  `runTddPhase`/`finalizeFeatureRun` decide every transition. A provider
  `completed` result is NEVER sufficient (ADR-0018).
- `execution-store.ts` — durable execution records under
  `.ai-kit/state/agent-executions/`; orchestration linkage under
  `.ai-kit/state/orchestrations/`.
- `journal.ts` (core) + `next-action.ts` (core) — the host-driven agent
  protocol surface (ADR-0021): `computeNextAction` derives the bounded
  `NextAction` payload behind `kit next`; every feature-workflow
  transition appends a hash-chained event to
  `.ai-kit/journal/feature-runs/<featureId>.jsonl` (runtime data,
  gitignored like `.ai-kit/state/`; observability, never authority).
  `packages/testing/src/conformance/tier-c.ts` defines the Tier C
  golden trace — the protocol conformance target every host must
  reproduce, proven for the CLI by
  `packages/cli/src/commands/tier-c-conformance.test.ts`.

Providers are INJECTED (`AgentGatewayOptions.providers`). Since PR4 the
shipped CLI registers the first real provider — claude-code
(`packages/cli/src/application/agent/providers/claude-code/`) — and gates
`run` on its healthCheck: an unavailable runtime fails with
`AGENT_PROVIDER_UNAVAILABLE` (exit 3), never a silent fallback and never
`bypassPermissions` (ADR-0019 §6.5). The provider derives the session's
permission configuration from the canonical snapshot (ADR-0020 §2),
links the runtime Mods into the worktree (parity, ADR-0020 §2/§3),
streams events live so the gateway's counters fire mid-run, and keeps
resume tokens only in the AES-256-GCM store (ADR-0020 §6.8). The
integration direction table (host adapter vs provider adapter) is in
ADR-0019 §2 — `claude-code-adapter` keeps its host-adapter role.
