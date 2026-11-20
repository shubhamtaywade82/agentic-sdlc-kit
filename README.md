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
- **pnpm**: `9.12.0` (pinned via `packageManager` in `package.json`)

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
pnpm --filter @agentic-sdlc-kit/cli link --global
```

---

## Core Workflows

The kit provides 15 commands covering the complete SDLC:

### 1. Repository Discovery & Initialization

```bash
# Inspect repository stacks, test frameworks, CI, and agent instructions (read-only)
kit inspect .

# Generate project profile (.ai-kit/project.yml)
kit init .
```

### 2. Incremental Feature Workflow (`kit feature`)

Executes a strict vertical-slice engineering workflow with an **evidence-gated TDD loop** (ADR-0018):

1. **Spec**: Validates user stories and acceptance criteria.
2. **Plan**: Computes implementation DAG and verifies acyclicity.
3. **TDD**: Phase-driven Red $\to$ Green $\to$ Refactor per task. The agent writes tests and implementations between invocations; the kit runs verification, records evidence, and refuses to advance when a phase invariant is broken.
4. **Verify**: Audits the persisted evidence chain, then runs deterministic test/lint/typecheck verification.
5. **Report**: Generates an execution report with per-task TDD evidence.

```bash
# Validate feature spec and implementation DAG
kit validate-spec docs/specifications/features/FEATURE-001/SPEC.md
kit validate-plan docs/plans/FEATURE-001/PLAN.md

# Drive the TDD phases (the agent implements between calls)
kit feature FEATURE-001 start
kit feature FEATURE-001 red TASK-001      # verification MUST fail
#   ... write the failing test, then implement TASK-001 ...
kit feature FEATURE-001 green TASK-001    # verification MUST pass
kit feature FEATURE-001 refactor TASK-001 # verification MUST pass again
kit feature FEATURE-001 verify            # audits evidence + final verification
```

Completion is blocked until every task has a persisted, complete
Red(failed) $\to$ Green(passed) $\to$ Refactor(passed) evidence chain.

### 3. Disciplined Bug Fixing (`kit fix`)

Enforces reproduction before code modification:

```bash
kit fix BUG-101
```

Workflow:

- Stage 1: Reproduce defect with a failing test (`Red`).
- Stage 2: Implement minimal corrective fix (`Green`).
- Stage 3: Confirm regression avoidance across test suite (`Refactor`).

### 4. Scaffold Greenfield App (`kit new`)

Scaffolds an application repository with baseline ADRs, `.ai-kit/project.yml`, and initial specifications:

```bash
kit new my-app --stack node-typescript --dir ./apps
```

Supported stacks: `node-typescript`, `react-spa`, `rails-hotwire`, `python`, `go`.

### 5. Deterministic Verification (`kit verify`)

Executes configured test, lint, typecheck, and build steps in isolated process executions without arbitrary shell interpretation:

```bash
kit verify
```

### 6. Memory & Self-Evolution (CLSE)

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
| **`sdlc-guard`**   | `tool.call`, `tool.check` | Enforces fail-closed safety policy on destructive actions (`rm -rf`, `git push --force`, table drops). |
| **`secret-guard`** | `tool.call`               | Redacts API keys (Stripe, GitHub, AWS, etc.) before writing or executing tools.                        |
| **`model-router`** | Routing policy            | Intelligently delegates lightweight jobs to Haiku and complex reasoning to Sonnet/Opus.                |
| **`run-observer`** | Lifecycle hooks           | Records bounded telemetry streams and audit events for every tool invocation.                          |

Install plugins into your runtime environment:

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
- [`docs/adr/`](docs/adr/) — Architecture Decision Records (ADR-0001 through ADR-0017).

---

## Safety & Boundaries

Claude Code Mods and host-runtime plugins execute with the host process's system permissions. They are **not** an operating-system sandbox. Real system isolation requires OS user permissions, containerization, credentials scoping, and deployment gates. See [`docs/security/SECURITY.md`](docs/security/SECURITY.md).

---

## License

MIT. See [`LICENSE`](LICENSE).
