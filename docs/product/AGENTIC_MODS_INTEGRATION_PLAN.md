# `agentic-sdlc-kit` × `agentic-mods` Integration Plan

The cleanest integration is **not** to copy every package from `agentic-sdlc-kit` into
`agentic-mods`. Instead, make **`agentic-sdlc-kit` the runtime-independent SDLC engine**, and
**`agentic-mods` the Claude Code distribution, UX and integration layer**.

`agentic-sdlc-kit` already contains most of the planned architecture: contracts, workflow engine,
planning DAG, TDD state machine, verification, a Claude Code adapter, Mod SDK, testing utilities,
and four standalone plugins, with package boundaries enforced by `scripts/check-architecture.ts`.

# Recommended product boundary

## `agentic-sdlc-kit` — owns engineering logic

SDLC workflows (feature, bug-fix, refactoring, application lifecycles), planning DAG, TDD state
machine, verification evidence, policy evaluation, project inspection, artifact schemas, CLI,
runtime-independent contracts.

## `agentic-mods` — owns the Claude Code experience

Claude Code marketplace, installation and presets, Cockpit UI, workflow visualization, mod
composition, external-mod adapters, Claude Code lifecycle hooks, runtime capability declarations,
compatibility testing, engineering bundles.

Dependency direction:

```text
agentic-sdlc-kit
        ↑
agentic-mods integrations
        ↑
Claude Code Mods API
```

`agentic-sdlc-kit` must never depend on `agentic-mods`.

---

# Package-by-package integration

| Existing package | Role inside `agentic-mods` | Integration decision |
|---|---|---|
| `packages/contracts` | Canonical event, workflow, evidence, approval, profile and policy schemas | **Direct dependency** |
| `packages/core` | SDLC workflow engine, planning DAG, TDD machine, verification logic | **Direct dependency through a bridge** |
| `packages/cli` | Headless execution and CI integration | **Keep independent; invoke or wrap** |
| `packages/claude-code-adapter` | Boundary between Claude Code and runtime-independent core | **Extend as host adapter** |
| `packages/mod-sdk` | Mod framework, capability model, middleware, mock runtime | **Standard SDK for every native mod** |
| `packages/testing` | Fixtures, contract validators, assertions | **Reuse in monorepo tests** |
| `plugins/sdlc-guard` | Destructive-command and deployment governance | **Publish in safety bundle** |
| `plugins/secret-guard` | Write, commit and output secret protection | **Publish in security bundle** |
| `plugins/model-router` | Role-based subagent routing | **Publish as optional orchestration mod** |
| `plugins/run-observer` | Tool, turn and agent telemetry plus status | **Use as Cockpit data provider** |

The core contracts already require command execution as argument arrays with `shell: false`,
rather than untrusted shell strings. Preserve this requirement in all `agentic-mods` workflows and
command adapters.

---

# Proposed architecture

```text
agentic-mods/
├── packages/
│   ├── sdlc-bridge/              # ONLY package that touches agentic-sdlc-kit/core
│   ├── workflow-ui/
│   ├── cockpit/
│   ├── external-mod-adapters/
│   └── preset-resolver/
├── mods/
│   ├── sdlc-controller/  ├── tdd-conductor/  ├── regression-orchestrator/
│   ├── evidence-gate/    ├── change-contract/  ├── pr-readiness/
│   ├── architecture-guard/  └── release-conductor/
├── integrations/agentic-sdlc-kit/
│   ├── contract-mappers/  ├── event-mappers/  ├── artifact-store/
│   ├── approval-provider/ └── verification-provider/
├── plugins/
│   ├── sdlc-guard/  ├── secret-guard/  ├── model-router/  └── run-observer/
├── workflows/
│   ├── feature-development/  ├── tdd/  ├── bug-fix/  ├── refactoring/
│   ├── regression/  ├── review/  └── release/
└── presets/
    ├── essential/  ├── engineering/  ├── tdd/
    ├── node-typescript/  ├── java-spring/  └── regulated/
```

# Integration layers

## 1. Contracts layer

Use `@agentic-sdlc-kit/contracts` as the canonical source for `ProjectProfile`, workflow state,
task and feature identifiers, verification results, approval requests, policy decisions, persistent
artifacts, and error/result types. Do **not** recreate equivalents such as
`AgenticVerificationResult` / `AgenticWorkflowState` / `AgenticApproval` /
`AgenticProjectProfile` inside `agentic-mods`. Create only Claude-specific envelope types:

```ts
import type { RunId, VerificationReport, WorkflowRun } from "@agentic-sdlc-kit/contracts";

export interface ClaudeWorkflowSession {
  sessionId: string;
  repositoryRoot: string;
  runId: RunId;
  workflow: WorkflowRun;
  verification?: VerificationReport;
}
```

The contracts package defines `Result<T>` conventions and stable error codes (`CONTRACT_INVALID`,
`VERIFICATION_FAILED`, `APPROVAL_REQUIRED`, `POLICY_VIOLATION`). Reuse these instead of throwing
arbitrary exceptions across mod boundaries.

## 2. Core bridge

`@agentic-mods/sdlc-bridge` — the only `agentic-mods` package that directly coordinates
`agentic-sdlc-kit/core`. Responsibilities: start and resume workflows; request stage transitions;
invoke TDD transitions; run verification; evaluate policies; load project profiles; persist workflow
artifacts; convert core results into Claude Code UI state; publish normalized events to the mod
event bus.

```ts
export interface SdlcBridge {
  initializeProject(root: string): Promise<BridgeResult<ProjectState>>;
  startWorkflow(request: StartWorkflowRequest): Promise<BridgeResult<WorkflowRun>>;
  transition(request: WorkflowTransitionRequest): Promise<BridgeResult<TransitionDecision>>;
  verify(request: VerificationRequest): Promise<BridgeResult<VerificationReport>>;
  evaluatePolicy(request: PolicyEvaluationRequest): Promise<BridgeResult<PolicyDecision>>;
}
```

UI mods must not import internal SDLC core modules directly; that keeps the core replaceable and
prevents Claude-specific behavior from leaking into domain logic.

## 3. Claude Code adapter

Extend `packages/claude-code-adapter` rather than creating a second host abstraction:

| Claude Code event | SDLC action |
|---|---|
| Session starts | Load project profile and active workflow |
| Prompt submitted | Detect workflow intent |
| Tool call begins | Evaluate policy and active contract |
| File write begins | Check scope, secret and architecture policies |
| Tool call completes | Capture verification or implementation evidence |
| Test command completes | Update TDD and regression state |
| Agent starts | Record delegated role |
| Turn completes | Evaluate stage readiness |
| Session stops | Persist run and audit artifacts |
| `ui.render` | Render cockpit and workflow panels |

## 4. Mod SDK

Use `packages/mod-sdk` as the development foundation for every native mod:

```ts
import { defineMod } from "@agentic-sdlc-kit/mod-sdk";

export default defineMod({
  id: "evidence-gate",
  capabilities: {
    hooks: ["tool.call", "turn.complete"],
    apiAccess: ["ui.render", "state.get", "state.set"],
    networkAccess: false,
    processExecution: false,
    modifiesToolCalls: true,
  },
  register(runtime) {
    // Bridge events into the SDLC core.
  },
});
```

The SDK becomes the single implementation point for capability manifests, middleware, error
isolation, state access, event validation, mod lifecycle, `MockRuntime`, compatibility helpers and
audit event emission — avoiding a from-scratch `@agentic-mods/mod-core`.

---

# How the existing plugins should be used

## `sdlc-guard`

Already intercepts force pushes, rebases, database migrations, production database mutations,
`npm publish`, `kubectl apply`, `terraform apply`, using allow/ask/deny decisions with declared
runtime capabilities. Use it as the foundation for Command Guard, Change Contract enforcement,
Release approval, Migration approval and Hotfix-policy enforcement. Do not add another
independently implemented `command-guard` unless it is only a UX layer over `sdlc-guard`.

Extension — add policy providers: `contract-policy`, `architecture-policy`, `release-policy`,
`hotfix-policy`, `protected-path-policy`. The underlying decision remains
`type Decision = "allow" | "ask" | "deny"`.

## `secret-guard`

Scans writes and staged changes, blocks detected secrets, redacts secrets from tool output;
distinguishes detection from verified redaction and fails closed if scanning cannot complete. Use it
in the Essential preset, TDD preset, PR Readiness, Release Gate, CI triage and incident response.

Extend scanners for: AWS access keys, GitHub tokens, Azure credentials, GCP service-account keys,
npm tokens, private keys, connection strings, JWT signing secrets, `.env` values. Keep actual
detection in runtime-independent core logic; the Claude mod remains a thin event adapter.

## `model-router`

Use only for delegated roles (repository analyst, architecture reviewer, code reviewer, security
reviewer, test analyst, release reviewer). Routing must be role-based, opt-in, auditable,
cost-aware, and restricted to subagents — it must not silently change the primary model selected by
the developer.

## `run-observer`

The telemetry provider for the Engineering Cockpit. Emit: `workflow.started`,
`workflow.stage.changed`, `tool.started`, `tool.completed`, `verification.updated`,
`tdd.state.changed`, `finding.created`, `approval.requested`, `policy.denied`, `agent.started`,
`agent.completed`. Local telemetry by default; remote collection disabled unless explicitly
configured.

---

# Mapping SDLC workflows into mods

Use the existing roadmap (milestones M2–M18: repository discovery, requirements, architecture
planning, TDD, deterministic verification, feature delivery, application development, bug fixing,
refactoring, runtime governance, stack packs, distribution, ecosystem integration) as the
implementation source rather than defining a competing workflow system.

| Engineering workflow | SDLC Kit engine | `agentic-mods` UX |
|---|---|---|
| Feature development | Incremental feature workflow | `/agentic feature` |
| New application | Greenfield application workflow | `/agentic app` |
| TDD | TDD state machine | TDD Conductor panel |
| Bug fix | Bug-fix workflow | `/agentic fix` |
| Refactoring | Refactoring workflow | Behavior Lock panel |
| Verification | Deterministic verification engine | Evidence Gate |
| Regression | Test-impact and verification policies | Regression Orchestrator |
| Review | Review contracts and findings | Review Tracker |
| Release | Release checks and approvals | Release Conductor |
| Runtime governance | Policy evaluator | `sdlc-guard` |
| Secret protection | Secret scanning and redaction | `secret-guard` |

# Unified workflow example

```text
User runs:  /agentic feature "Add CSV import with validation"

sdlc-controller        Starts incremental-feature workflow
agentic-sdlc-kit/core Creates WorkflowRun, requirements artifact,
                      validates specification, builds planning DAG
change-contract       Restricts files and expected outputs
tdd-conductor         Enforces RED → GREEN → REFACTOR
regression-orchestrator  Calculates required regression scope
evidence-gate         Records build, tests, lint and type checking
review-tracker        Tracks review findings
pr-readiness          Evaluates completion
release-conductor     Checks release evidence
```

The SDLC Kit remains the authority for workflow state; mods observe, render and enforce it.

---

# Installation and distribution options

## Recommended initially: Git dependency

```json
{
  "dependencies": {
    "@agentic-sdlc-kit/contracts": "github:shubhamtaywade82/agentic-sdlc-kit#main",
    "@agentic-sdlc-kit/core": "github:shubhamtaywade82/agentic-sdlc-kit#main",
    "@agentic-sdlc-kit/mod-sdk": "github:shubhamtaywade82/agentic-sdlc-kit#main"
  }
}
```

Git dependencies are awkward when packages are workspace-relative; a pinned commit is safer than
`main`, but package-level publishing is better.

## Preferred production model: npm packages

```json
{
  "dependencies": {
    "@agentic-sdlc-kit/contracts": "^0.2.0",
    "@agentic-sdlc-kit/core": "^0.2.0",
    "@agentic-sdlc-kit/claude-code-adapter": "^0.2.0",
    "@agentic-sdlc-kit/mod-sdk": "^0.2.0"
  },
  "devDependencies": {
    "@agentic-sdlc-kit/testing": "^0.2.0"
  }
}
```

## Alternative: one combined monorepo

```text
agentic-sdlc-kit/
├── packages/
│   ├── contracts/  ├── core/  ├── cli/  ├── claude-code-adapter/
│   ├── mod-sdk/    ├── testing/  ├── cockpit/  └── preset-resolver/
├── plugins/
│   ├── sdlc-guard/  ├── secret-guard/  ├── model-router/  ├── run-observer/
│   ├── evidence-gate/  ├── tdd-conductor/  ├── regression-orchestrator/
│   ├── change-contract/  └── pr-readiness/
└── marketplace/
    ├── marketplace.json
    └── presets/
```

### Practitioner recommendation

Use the **combined-monorepo model**. The repository already uses Node.js 20.11+, TypeScript 5.9,
pnpm 9.12, Vitest 2.1, package boundaries, and a `plugins/` directory. Creating another monorepo
would duplicate CI, versioning, contracts, fixtures, Mod SDK work and architectural checks.

Rename the marketplace/distribution brand to `agentic-mods`, keeping the repository and core
product as `agentic-sdlc-kit`:

```text
Repository:            agentic-sdlc-kit
Core engine:           Agentic SDLC Kit
Claude marketplace:     agentic-mods
Cockpit:               Agentic Engineering Cockpit
```

---

# Revised internal dependencies

Preserve and extend the current import rules:

```text
contracts → core → mod-sdk → plugins
```

Recommended complete graph:

```text
contracts  ├── core ├── testing └── claude-code-adapter
core       ├── cli  ├── mod-sdk  └── sdlc-bridge
mod-sdk    └── plugins/*
sdlc-bridge ├── cockpit └── workflow mods
testing    └── all package and plugin tests
```

Additional architecture rules: cockpit imports contracts and sdlc-bridge only; plugins import
contracts, core and mod-sdk only; external adapters cannot import plugin internals; no plugin
imports another plugin; no package imports from sibling `dist/`; core cannot import Claude Code
APIs; contracts cannot perform I/O. The existing repository already enforces dependency invariants
through `scripts/check-architecture.ts` — extend that script instead of introducing a second
architecture checker.

---

# Presets using all packages and plugins

| Preset | Contents |
|---|---|
| **Essential** | sdlc-controller, sdlc-guard, secret-guard, run-observer, evidence-gate |
| **Engineering** | essential + change-contract, tdd-conductor, regression-orchestrator, review-tracker, pr-readiness, architecture-guard |
| **TDD** | sdlc-controller, tdd-conductor, evidence-gate, test-impact, regression-orchestrator, behavior-lock |
| **Release** | sdlc-guard, secret-guard, evidence-gate, pr-readiness, migration-sentinel, dependency-risk-radar, release-conductor |
| **Regulated** | engineering + release, immutable local audit log, mandatory approvals, exception expiry, artifact retention, capability allowlist, network disabled by default |

---

# Implementation roadmap

| Phase | Duration | Work |
|---|---|---|
| 1. Consolidate foundations | 1–2 weeks | Adopt existing monorepo as shared source; add `marketplace/`; treat `agentic-mods` as marketplace name; export public contracts via package entry points; add Changesets; define API compatibility policy; extend architecture checks; add marketplace-generation script |
| 2. Bridge core to Mods API | 2 weeks | Complete `claude-code-adapter`; standardize Mod SDK lifecycle; implement `sdlc-bridge`; map tool and session events; add local workflow-state persistence; add `MockRuntime` integration tests |
| 3. Package existing mods | 1–2 weeks | Package sdlc-guard, secret-guard, model-router, run-observer; validate capability manifests; generate marketplace metadata; add Essential preset |
| 4. Engineering workflow mods | 3–5 weeks | sdlc-controller, evidence-gate, change-contract, tdd-conductor, regression-orchestrator, pr-readiness |
| 5. Cockpit and review | 2–3 weeks | Unified workflow status, evidence panel, TDD panel, regression panel, review findings, approval inbox, `/agentic status`, `/agentic doctor` |
| 6. Reliability | 3–5 weeks | Architecture Guard, Migration Sentinel, Dependency Risk Radar, Performance Budget Guard, Release Conductor, Hotfix workflow |

# First concrete milestone

```text
agentic-mods 0.1

Engine:       @agentic-sdlc-kit/contracts, core, claude-code-adapter, mod-sdk
Plugins:      sdlc-guard, secret-guard, model-router, run-observer
New mods:     sdlc-controller, evidence-gate, tdd-conductor, regression-orchestrator
Workflows:    feature, bug-fix, tdd, regression
Presets:      essential, engineering, tdd
```

# Bottom line

Do **not** create a parallel SDLC engine in `agentic-mods`. `agentic-sdlc-kit` already contains — or
has explicit architectural positions for — the contracts, runtime-independent core, TDD machine,
verification engine, Claude adapter, Mod SDK, testing support and four runtime plugins.

```text
agentic-sdlc-kit = engineering brain
agentic-mods     = Claude Code marketplace and runtime experience
cockpit          = unified engineering UI
```

Consolidating in the existing pnpm monorepo gives one contract model, one CI pipeline, one test
system and one architecture checker, while still allowing each mod to be installed independently.
