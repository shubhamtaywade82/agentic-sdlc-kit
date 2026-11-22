# Agentic SDLC Kit

A **runtime-independent** Agentic Software Development Lifecycle (SDLC) kit. It gives AI coding assistants and engineering teams a disciplined, structured workflow engine to take a feature, bug fix, refactoring, or new application from ambiguous requirements to verified, reviewable code without sacrificing software engineering rigor.

---

## Architecture Overview

The repository is organized as a modular TypeScript monorepo under `packages/` and `plugins/`:

```
agentic-sdlc-kit/
├── packages/
│   ├── contracts/            # Shared Zod schemas and TypeScript domain contracts (imports nothing)
│   ├── core/                 # Runtime-independent workflow engine, DAG planner, TDD machine, CLSE
│   ├── cli/                  # `kit` command-line interface (15 commands)
│   ├── claude-code-adapter/  # Host runtime adapter and approval gate boundary
│   ├── mod-sdk/              # Mod development framework (MockRuntime, capabilities, middleware)
│   └── testing/              # Test fixtures, assertion helpers, and contract validators
├── plugins/                  # Standalone Claude Code runtime plugins (Mods)
│   ├── sdlc-guard/           # Intercepts destructive operations and enforces fail-closed policy
│   ├── secret-guard/         # Scans and redacts credentials and API keys before write/exec
│   ├── model-router/         # Cost-aware model tier routing (Haiku / Sonnet / Opus)
│   └── run-observer/         # Bounded event streaming and telemetry recorder
├── docs/                     # Specifications, architecture, contracts, ADRs, and workflows
└── scripts/                  # Architecture verification and build scripts
```

### Architectural Invariants

Enforced by `scripts/check-architecture.ts` in CI:

1. `contracts` imports nothing from sibling packages.
2. `core` imports only from `contracts`.
3. `cli` imports only from `core` and `contracts`.
4. `testing` imports only from `contracts`.
5. `claude-code-adapter` imports only from `contracts`.
6. `mod-sdk` imports only from `contracts` and `core`.
7. `plugins/*` import only from `contracts`, `core`, and `mod-sdk`.
8. The engine core is **runtime-independent**; host adapters bridge host-specific runtimes to core contracts.

---

## Quick Start

### 1. Requirements & Installation

- **Node.js**: `>= 20.11.0`
- **pnpm**: `>= 12.0.0` (pinned via `packageManager` in `package.json`)

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Build all packages and plugins
pnpm run build

# Run full verification (architecture check, build, lint, typecheck, test)
pnpm run verify
```

### 2. Verify CLI Health

```bash
node packages/cli/dist/index.js doctor
```

_(Optional)_ Link `kit` globally to run directly from your PATH:

```bash
pnpm add -g ./packages/cli
```

---

## Core Workflows

The kit provides 16 commands covering the complete SDLC:

### 1. Repository Discovery & Initialization

```bash
# Inspect repository stacks, test frameworks, CI, and agent instructions (read-only)
kit inspect .

# Generate project profile (.ai-kit/project.yml)
kit init .
```

### 2. Requirements Elicitation (`kit elicit`)

```bash
# Ask the blocking questions for a feature, saving after each answer
kit elicit FEATURE-001
# Non-interactive (agents, CI): all-or-nothing
kit elicit FEATURE-001 --answers answers.json
# Gate check only: exit 1 while a blocking question has no user answer
kit elicit FEATURE-001 --check
```

Blocking questions must be answered by a person; only non-blocking ones may be recorded as assumptions.

### 3. Incremental Feature Workflow (`kit feature`)

Executes a strict vertical-slice engineering workflow with an **evidence-gated TDD loop** (ADR-0018):

1. **Spec**: Validates user stories and acceptance criteria.
2. **Plan**: Computes implementation DAG and verifies acyclicity.
3. **TDD**: Phase-driven Red $\to$ Green $\to$ Refactor per task. The agent writes tests and implementations between invocations; the kit runs verification, records evidence, and refuses to advance when a phase invariant is broken.
4. **Verify**: Audits the persisted evidence chain, then runs deterministic test/lint/typecheck verification.
5. **Report**: Generates an execution report with per-task TDD evidence.

The spec and plan are authored by your agent following
`docs/workflows/WORKFLOWS.md` (step 4: requirements-engineering, step 7:
implementation-planning). The loaders expect:

- `docs/specifications/features/<ID>/SPEC.md` starting with `# <ID>: Title`
  (missing or malformed title lines are rejected, not defaulted)
- `docs/plans/<ID>/plan.json` (or `PLAN.md` with an embedded JSON block)
  matching the Task/ImplementationPlan contracts in `docs/contracts/CONTRACTS.md`.
  The plan's `featureId` must match the requested feature id.

```bash
# Validate feature spec and implementation DAG
kit validate-spec docs/specifications/features/FEATURE-001/SPEC.md
kit validate-plan docs/plans/FEATURE-001/plan.json

# Drive the TDD phases (the agent implements between calls)
kit feature FEATURE-001 start
kit feature FEATURE-001 red TASK-001      # verification MUST fail
#   ... write the failing test, then implement TASK-001 ...
kit feature FEATURE-001 green TASK-001    # verification MUST pass
kit feature FEATURE-001 refactor TASK-001 # verification MUST pass again
kit feature FEATURE-001 verify            # audits evidence + final verification

# Preview the plan without executing anything:
kit feature FEATURE-001 verify --dry-run
```

Completion is blocked until every task has a persisted, complete
Red(failed) $\to$ Green(passed) $\to$ Refactor(passed) evidence chain.

Any host with terminal access (Cursor, AGY, CI) can drive the same
loop through the host-driven agent protocol (ADR-0021) — one bounded,
machine-readable entry point instead of prose instructions:

```bash
kit next --json        # { requiredAction, taskId, verificationCommand, nextInvocation, ... }
kit journal FEATURE-001 --verify   # tamper-evident executed record (hash-chained)
```

### 4. Disciplined Bug Fixing (`kit fix`)

Enforces reproduction before code modification:

```bash
kit fix BUG-101
```

Workflow:

- Stage 1: Reproduce defect with a failing test (`Red`).
- Stage 2: Implement minimal corrective fix (`Green`).
- Stage 3: Confirm regression avoidance across test suite (`Refactor`).

### 5. Scaffold Greenfield App (`kit new`)

Scaffolds an application repository with baseline ADRs, `.ai-kit/project.yml`, and initial specifications:

```bash
kit new my-app --stack node-typescript --dir ./apps
```

Supported stacks: `node-typescript`, `react-spa`, `rails-hotwire`, `python`, `go`.

### 6. Deterministic Verification (`kit verify`)

Executes configured test, lint, typecheck, and build steps in isolated process executions without arbitrary shell interpretation:

```bash
kit verify
```

### 7. Memory & Self-Evolution (CLSE)

Hierarchical memory store and Continuous Learning & Self-Evolution engine:

```bash
# Query episodic, semantic, and procedural engineering memory
kit memory "architecture invariants" --domain architecture

# Run continuous learning distillation, hypothesis generation & benchmarks
kit evolve
```

---

## Claude Code Runtime Plugins (Mods)

The kit includes 4 installable plugins in [`plugins/`](plugins/):

| Plugin             | Capability                | Function                                                                                               |
| :----------------- | :------------------------ | :----------------------------------------------------------------------------------------------------- |
| **`sdlc-guard`**   | `tool.call`, `tool.check` | Token-level classifier: asks before destructive commands (`rm -r`, force-push, `reset --hard`, DB drops, deploys, `curl \| sh`) via `$.ui.ask`; denies when non-interactive; fails closed via `.catch`. |
| **`secret-guard`** | `tool.call`               | Redacts secrets in tool output and refuses writes, commits and pushes that add a known secret format; fails closed. |
| **`model-router`** | `turn.step`, `agent.spawn` | Routes model and effort per request and per subagent; suggest-only by default, preserves explicit model choices. |
| **`run-observer`** | Lifecycle events          | Records bounded telemetry for sessions, turns and tool calls. Never blocks the chain. |

Install plugins into your runtime environment. Each plugin is a Claude Code
Mod (v2.1.287 or later): it ships its hooks as TypeScript source
(`hooks/register.ts`) that Claude Code loads in-process, so linking works
straight from a fresh clone with no build step. The installer validates each
hooks module path before linking and reports per-plugin results:

```bash
kit install --profile full-sdlc --stack node-typescript
```

---

## Documentation

- [`QUICKSTART.md`](QUICKSTART.md) — Step-by-step practical walk-through.
- [`docs/HOST_INTEGRATIONS.md`](docs/HOST_INTEGRATIONS.md) — Setup and usage guide for Claude Code, Cursor, AGY, and CI/CD.
- [`AGENTS.md`](AGENTS.md) — Coding conventions and architectural invariants for AI agents.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — Contribution standards and verification requirements.
- [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) — Monorepo design, boundaries, and invariants.
- [`docs/workflows/WORKFLOWS.md`](docs/workflows/WORKFLOWS.md) — State machine specifications for feature, app, fix, and refactor.
- [`docs/product/PRODUCT.md`](docs/product/PRODUCT.md) — Vision, target personas, and non-goals.
- [`docs/security/SECURITY.md`](docs/security/SECURITY.md) — Threat model, security boundaries, and redaction rules.
- [`docs/adr/`](docs/adr/) — Architecture Decision Records (ADR-0001 through ADR-0021).

---

## Safety & Boundaries

Claude Code Mods and host-runtime plugins execute with the host process's system permissions. They are **not** an operating-system sandbox. Real system isolation requires OS user permissions, containerization, credentials scoping, and deployment gates. See [`docs/security/SECURITY.md`](docs/security/SECURITY.md).

---

## License

MIT. See [`LICENSE`](LICENSE).
