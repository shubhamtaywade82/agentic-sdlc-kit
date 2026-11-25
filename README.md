# Agentic SDLC Kit

A **runtime-independent** Agentic Software Development Lifecycle (SDLC) kit. It gives AI coding assistants and engineering teams a disciplined, structured workflow engine to take a feature, bug fix, refactoring, or new application from ambiguous requirements to verified, reviewable code without sacrificing software engineering rigor.

---

## Architecture Overview

The repository is organized as a modular TypeScript monorepo under `packages/`, `plugins/` and `mods/`:

```
agentic-sdlc-kit/
├── packages/
│   ├── contracts/            # Shared Zod schemas and TypeScript domain contracts (imports nothing)
│   ├── core/                 # Runtime-independent workflow engine, DAG planner, TDD machine, CLSE
│   ├── cli/                  # `kit` command-line interface (23 commands)
│   ├── claude-code-adapter/  # Host runtime adapter and approval gate boundary
│   ├── mod-sdk/              # Mod development framework (MockRuntime, capabilities, middleware)
│   ├── testing/              # Test fixtures, assertion helpers, and contract validators
│   ├── sdlc-bridge/          # ONLY package that coordinates core from the marketplace layer (scaffold)
│   ├── workflow-ui/          # Workflow / TDD / readiness panel state (scaffold)
│   ├── cockpit/              # Unified engineering cockpit state (scaffold)
│   ├── preset-resolver/      # Preset → mod set resolution (scaffold)
│   └── external-mod-adapters/ # Adapters for catalogued external mods (scaffold)
├── plugins/                  # Standalone Claude Code runtime plugins (Mods)
│   ├── sdlc-guard/           # Intercepts destructive operations and enforces fail-closed policy
│   ├── secret-guard/         # Scans and redacts credentials and API keys before write/exec
│   ├── model-router/         # Cost-aware model tier routing (Haiku / Sonnet / Opus)
│   └── run-observer/         # Bounded event streaming and telemetry recorder
├── mods/                     # agentic-mods marketplace engineering mods (8, scaffold)
├── workflows/                # Declarative SDLC workflow stage machines (scaffold)
├── marketplace/              # Installable mod presets (scaffold)
├── tooling/                  # Marketplace generation/validation + create-mod (scaffold)
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

The kit provides 23 commands covering the complete SDLC:

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

> **AI Assistant Shortcut:** In Claude Code, run `/kit-feature FEATURE-001 <story text>` to let the agent drive the complete specification, planning, and TDD loop automatically without typing individual CLI steps.

### 4. Disciplined Bug Fixing (`kit fix`)

A defect runs through the same evidence-gated engine as a feature (the issue id is the run id):

```bash
kit fix BUG-101 start
kit fix BUG-101 red TASK-001      # regression test must FAIL as an assertion
kit fix BUG-101 green TASK-001    # smallest correction must pass it
kit fix BUG-101 refactor TASK-001 # suite must stay green
kit fix BUG-101 verify            # audits the chain + whole-profile regression
```

Green is refused until Red was observed; the run is journaled like any feature run.

> **AI Assistant Shortcut:** In Claude Code, run `/kit-fix BUG-101 <expected vs actual>` to initiate the regression-first defect repair workflow.

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

## AI Assistant Slash Commands & Host Workflows

While deterministic CLI commands (`kit inspect`, `kit verify`, `kit doctor`, etc.) run directly in terminal sessions and CI/CD pipelines, AI-driven workflows are initiated from inside your AI coding assistant (ADR-0013).

### Available Slash Commands (Claude Code)

After a one-time setup (`kit host install claude-code`), interact with your assistant using high-level slash commands:

| Slash Command | Arguments | Purpose & Workflow |
| :--- | :--- | :--- |
| **`/kit-feature`** | `<TICKET-ID> <story text / acceptance criteria>` | Initiates and drives the vertical-slice feature workflow: guides specification and DAG task planning, validates schemas, and drives the Red $\to$ Green $\to$ Refactor TDD cycle per task until verified. |
| **`/kit-fix`** | `<BUG-ID> <expected vs actual behavior>` | Executes disciplined defect fixing: captures a failing regression test as an assertion first before applying the minimal fix and verifying behavior preservation. |
| **`/kit-resume`** | `<TICKET-ID>` | Inspects the recorded run state and resumes an existing workflow from its current phase without restarting or discarding prior evidence. |

*(Note: Informational CLI commands like `kit refactor` and `kit optimize` provide guidance for corresponding AI assistant workflows `/kit:refactor` and `/kit:optimize`.)*

### One-Time Host Setup (`kit host`)

`kit host` installs standing instructions, slash commands, and skills into each AI host's configuration surface, allowing agents to drive the kit's machine protocol (`kit next --json`) autonomously:

```bash
# List instruction surfaces across all supported hosts
kit host list

# Install slash commands and standing skill for Claude Code (~/.claude/commands/ & ~/.claude/skills/)
kit host install claude-code

# Install for all detected hosts at default scopes (user where global, else project)
kit host install all

# Install project-level rules for Cursor
kit host install cursor --dir .
```

Supported host surfaces include:
- **Claude Code**: Slash commands (`/kit-feature`, `/kit-fix`, `/kit-resume`) and standing skill in `~/.claude/`
- **Cursor / Cursor CLI**: Always-on SDLC rules in `.cursor/rules/sdlc.mdc`
- **Antigravity (AGY)**: Standing skill in `~/.gemini/skills/agentic-sdlc-kit/SKILL.md`
- **Gemini CLI**: Managed instruction block in `~/.gemini/GEMINI.md` or `GEMINI.md`
- **Codex**: Managed instruction block in `.codex/AGENTS.md` or `AGENTS.md`
- **Aider**: Managed convention block in `CONVENTIONS.md`

See [`docs/HOST_INTEGRATIONS.md`](docs/HOST_INTEGRATIONS.md) for full configuration details and host-driven protocol documentation.

---

## Claude Code Runtime Plugins (Mods)

The kit includes 4 installable plugins in [`plugins/`](plugins/):

| Plugin             | Capability                | Function                                                                                               |
| :----------------- | :------------------------ | :----------------------------------------------------------------------------------------------------- |
| **`sdlc-guard`**   | `tool.call`, `tool.check` | Token-level classifier: asks before destructive commands (`rm -r`, force-push, `reset --hard`, DB drops, deploys, `curl \| sh`) via `$.ui.ask`; denies when non-interactive; fails closed via `.catch`. |
| **`secret-guard`** | `tool.call`               | Redacts secrets in tool output, refuses secret-bearing writes/commits, and scans local commit history before a narrow push; ambiguous push scopes are denied. |
| **`model-router`** | `turn.step`, `agent.spawn` | Routes model and effort per request and per subagent; suggest-only by default, preserves explicit model choices. |
| **`run-observer`** | Lifecycle events          | Records telemetry with per-run event caps and a bounded retained-run window. Telemetry and state-publication failures never block the chain. |

Install plugins into your runtime environment. Each plugin is a Claude Code
Mod (v2.1.287 or later): it ships its hooks as TypeScript source
(`hooks/register.ts`) that Claude Code loads in-process, so linking works
straight from a fresh clone with no build step. The installer validates each
hooks module path before linking and reports per-plugin results:

```bash
kit install --profile full-sdlc --stack node-typescript
```

---

## Agentic Mods Marketplace (scaffold)

This repository also hosts the **agentic-mods** marketplace layer: the Claude Code distribution and UX surface built on top of the kit's engineering core. The scaffold (merged from the standalone `agentic-mods` design, see the integration plan below) adds:

- **`mods/`** — 8 engineering workflow mods: `sdlc-controller`, `evidence-gate`, `change-contract`, `tdd-conductor`, `regression-orchestrator`, `pr-readiness`, `architecture-guard`, `release-conductor`. Each ships an `agenticMods` capability manifest in `.claude-plugin/plugin.json` (hooks, network/process access, `claudeCode >= 2.1.287`).
- **Marketplace packages** — `@agentic-mods/sdlc-bridge` (the only package allowed to coordinate `@agentic-sdlc-kit/core`), `workflow-ui`, `cockpit`, `preset-resolver`, `external-mod-adapters`.
- **`workflows/`** — declarative stage machines for feature-development, tdd, bug-fix, regression, review, refactoring and release, with per-stage mod bindings.
- **`marketplace/presets/`** — installable bundles: `essential`, `engineering`, `tdd`, `release`, `regulated`.
- **`tooling/`** — `pnpm marketplace:generate` / `pnpm marketplace:validate` maintain [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json), which now registers the 8 mods alongside the 4 runtime guard plugins.

Status: **scaffold**. The mods compile and are registered in the marketplace manifest; runtime wiring is the next milestone — `defineMod` still comes from a local stand-in until `@agentic-sdlc-kit/mod-sdk` exports it, and `sdlc-bridge` maps its request/decision types onto the real core APIs. See [`docs/product/AGENTIC_MODS_INTEGRATION_PLAN.md`](docs/product/AGENTIC_MODS_INTEGRATION_PLAN.md) for the phased roadmap, [`docs/architecture/AGENTIC_MODS_MARKETPLACE.md`](docs/architecture/AGENTIC_MODS_MARKETPLACE.md) for the marketplace layering rules, and [`docs/mods/MOD_DEVELOPMENT.md`](docs/mods/MOD_DEVELOPMENT.md) for the authoring workflow.

---

## Skills Packs Integration

The kit integrates three external agent-skills packs as stack-scoped expertise
for AI coding agents. Each pack follows the open Agent Skills format
(`skills/<name>/SKILL.md`); the kit never bundles pack content — `kit skills`
fetches packs from their GitHub repositories at install time and maps the kit's
SDLC workflow stages (requirements, spec, plan, tdd, verify, review, fix,
refactor, release) to concrete skills per stack:

| Pack | Repository | Skills | Kit stacks served |
| :------------------- | :----------------------------------------------------------- | -----: | :------------------ |
| **`ruby-agent-skills`** | [shubhamtaywade82/ruby-agent-skills](https://github.com/shubhamtaywade82/ruby-agent-skills) | 104 | `ruby-rails`, `ruby` |
| **`node-agent-skills`** | [shubhamtaywade82/node-agent-skills](https://github.com/shubhamtaywade82/node-agent-skills) | 322 | `node-typescript` |
| **`react-agent-skills`** | [shubhamtaywade82/react-agent-skills](https://github.com/shubhamtaywade82/react-agent-skills) | 129 | `react-typescript` |

```bash
kit skills                                          # list the integrated packs
kit skills recommend --stack ruby-rails --stage tdd # which expertise to load per SDLC stage
kit skills install node-agent-skills --dir ./my-app # install into .claude/skills (idempotent)
```

Installed skills land in `<project>/.claude/skills/<skill>/` and are recorded
in `<project>/.ai-kit/skills-manifest.json` with the pack commit. See
[`docs/skills/SKILL_PACKS.md`](docs/skills/SKILL_PACKS.md) for the full
workflow mapping, install options, and the core registry API.

---

## Documentation

- **[Documentation site](https://shubhamtaywade82.github.io/agentic-sdlc-kit/)** — Complete rendered documentation (guide, workflows, architecture, contracts, ADRs) deployed to GitHub Pages.
- [`QUICKSTART.md`](QUICKSTART.md) — Step-by-step practical walk-through.
- [`docs/HOST_INTEGRATIONS.md`](docs/HOST_INTEGRATIONS.md) — Setup and usage guide for Claude Code, Cursor, AGY, and CI/CD.
- [`docs/skills/SKILL_PACKS.md`](docs/skills/SKILL_PACKS.md) — Integrating the ruby/node/react agent-skills packs with kit stacks and workflows.
- [`AGENTS.md`](AGENTS.md) — Coding conventions and architectural invariants for AI agents.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — Contribution standards and verification requirements.
- [`docs/product/AGENTIC_MODS_INTEGRATION_PLAN.md`](docs/product/AGENTIC_MODS_INTEGRATION_PLAN.md) — agentic-mods marketplace scaffold: product boundary, bridge design, presets, and phased roadmap.
- [`docs/architecture/AGENTIC_MODS_MARKETPLACE.md`](docs/architecture/AGENTIC_MODS_MARKETPLACE.md) — Marketplace layering rules for mods, cockpit, and the sdlc-bridge.
- [`docs/mods/MOD_DEVELOPMENT.md`](docs/mods/MOD_DEVELOPMENT.md) — How to author, declare, and register a new mod.
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
