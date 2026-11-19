# Quick Start Guide

This guide walks you through setting up and using the **Agentic SDLC Kit** for day-to-day engineering tasks: inspecting repositories, building features, fixing bugs, scaffolding apps, and running runtime guard plugins.

---

## 1. Installation and Health Check

### Prerequisites

- **Node.js**: `>= 20.11.0`
- **pnpm**: `9.12.0` (managed via Corepack or installed globally)

### Build and Test

```bash
# Clone and install dependencies
pnpm install --frozen-lockfile

# Compile TypeScript across all packages and plugins
pnpm run build

# Run the complete verification suite (architecture, lint, types, tests)
pnpm run verify
```

### CLI Verification

```bash
# Run doctor check
node packages/cli/dist/index.js doctor

# (Optional) Link the CLI globally so you can run `kit` anywhere
pnpm --filter @agentic-sdlc-kit/cli link --global
```

---

## 2. Onboarding an Existing Repository

When introducing Agentic SDLC Kit to an existing project:

### Step 1: Inspect the Project (Read-Only)

`kit inspect` examines project manifests, directory layouts, test runners, and git history without executing untrusted code:

```bash
kit inspect /path/to/project
```

Output reports detected technology stacks (e.g., `node-typescript`, `rails-hotwire`), package managers, entry points, and existing agent instruction files (`AGENTS.md`, `CLAUDE.md`, etc.).

### Step 2: Initialize Configuration

Generate the project profile at `.ai-kit/project.yml`:

```bash
kit init /path/to/project
```

This file declares:

- Repository metadata and stack profile
- Verification commands (`test`, `lint`, `typecheck`, `build`)
- Protected paths and governance policies

---

## 3. Scaffolding a New Application

To create a clean greenfield project with architecture ADRs, initial specs, and project profile:

```bash
kit new order-service --stack node-typescript --dir ./services
```

Available stacks:

- `node-typescript`
- `react-spa`
- `rails-hotwire`
- `python`
- `go`

---

## 4. End-to-End Feature Development

The feature workflow enforces vertical-slice development, TDD cycles, and deterministic verification.

### Step 1: Write and Validate the Feature Spec

Create the specification directory:

```bash
mkdir -p docs/specifications/features/FEATURE-001
```

Create `docs/specifications/features/FEATURE-001/SPEC.md` with user stories, acceptance criteria, and risk level.

Validate the spec against schemas and quality invariants:

```bash
kit validate-spec docs/specifications/features/FEATURE-001/SPEC.md
```

### Step 2: Write and Validate the Implementation Plan

Create `docs/plans/FEATURE-001/PLAN.md` defining tasks and dependencies.

Validate the DAG for acyclicity and task references:

```bash
kit validate-plan docs/plans/FEATURE-001/PLAN.md
```

### Step 3: Run the Feature Workflow

Execute the workflow engine:

```bash
# Dry run to preview execution steps:
kit feature FEATURE-001 --dry-run

# Run full feature implementation:
kit feature FEATURE-001
```

The engine will:

1. Scan the repository and load `.ai-kit/project.yml`.
2. Parse and validate the feature specification and DAG plan.
3. Advance through Red-Green-Refactor TDD phases for each task.
4. Run deterministic process verification (`kit verify`).
5. Output execution evidence and report summary.

---

## 5. Disciplined Bug Fixing

Fixes require reproduction tests before applying fixes:

```bash
kit fix BUG-042
```

The workflow enforces:

1. **Red**: Capturing a failing regression test replicating the issue.
2. **Green**: Applying the minimal code change to satisfy the test.
3. **Refactor**: Running the complete test suite to prevent regressions.

---

## 6. Deterministic Verification

Run project tests, typechecks, lints, and builds in a subprocess runner (without shell injection risks):

```bash
kit verify
```

Exit code `0` indicates all verification gates passed.

---

## 7. Memory & Self-Evolution (CLSE)

The kit includes a 4-tier memory store and continuous learning loop:

```bash
# Query engineering knowledge and patterns:
kit memory "architecture" --domain architecture

# Run continuous learning distillation and Evolution Lab experiments:
kit evolve
```

---

## 8. Claude Code Plugins (Runtime Mods)

Runtime mods provide active governance during interactive coding sessions:

| Mod            | Directory              | Protection                                                    |
| :------------- | :--------------------- | :------------------------------------------------------------ |
| `sdlc-guard`   | `plugins/sdlc-guard`   | Prevents `rm -rf`, force-pushes, and production DB mutations. |
| `secret-guard` | `plugins/secret-guard` | Scans and redacts credentials before tool calls execute.      |
| `model-router` | `plugins/model-router` | Routes tasks to optimal model tiers (Haiku, Sonnet, Opus).    |
| `run-observer` | `plugins/run-observer` | Emits lifecycle event logs and audit telemetry.               |

### Installing into Claude Code

```bash
kit install --profile full-sdlc --stack node-typescript
```

Each plugin contains a `.claude-plugin/plugin.json` and `hooks/hooks.json` specifying hook triggers (`tool.call`, `tool.check`, `session.start`).

For setup guides covering **Claude Code**, **Cursor**, **Antigravity (AGY)**, and **CI/CD**, see [`docs/HOST_INTEGRATIONS.md`](docs/HOST_INTEGRATIONS.md).
