# Quick Start Guide

This guide walks you through setting up and using the **Agentic SDLC Kit** for day-to-day engineering tasks: inspecting repositories, building features, fixing bugs, scaffolding apps, and running runtime guard plugins.

---

## 1. Installation and Health Check

### Prerequisites

- **Node.js**: `>= 20.11.0`
- **pnpm**: `>= 12.0.0` (managed via Corepack or installed globally)

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
pnpm add -g ./packages/cli
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

The workflow is **phase-driven** (ADR-0018): your agent writes the tests
and implementations between invocations; the kit verifies, records
evidence, and refuses to advance when a phase invariant is broken.

```bash
# Initialize the run state from the validated spec and plan:
kit feature FEATURE-001 start

# Drive the TDD phases per task (the agent implements between calls):
kit feature FEATURE-001 red TASK-001      # verification MUST fail (assertion)
kit feature FEATURE-001 green TASK-001    # verification MUST pass
kit feature FEATURE-001 refactor TASK-001 # verification MUST pass again
kit feature FEATURE-001 verify            # audits evidence + final verification
```

Agents driving this from any host (Cursor, AGY, CI) do not need to
remember the phase order — the host-driven agent protocol (ADR-0021)
tells them the next action:

```bash
kit next --json   # { requiredAction, taskId, verificationCommand, nextInvocation }
```

**Slash Command Shortcut (Claude Code):**
If you have run `kit host install claude-code`, simply type:
```text
/kit-feature FEATURE-001 Implement user authentication with JWT
```
The agent executes the entire spec, plan, and TDD loop autonomously.

Alternatively, `kit feature FEATURE-001 run` orchestrates every phase
through a configured agent provider (Mode 1, ADR-0019) in an isolated
git worktree, and `kit feature FEATURE-001 verify --dry-run` previews
the audit without executing anything.

---

## 5. Disciplined Bug Fixing

A defect runs through the same evidence-gated engine as a feature; the issue id
is the run id. Author a spec (expected vs actual) and a one-task plan first.

```bash
kit fix BUG-042 start
kit fix BUG-042 red TASK-001       # the regression test must FAIL as an assertion
kit fix BUG-042 green TASK-001     # the smallest correction must pass it
kit fix BUG-042 refactor TASK-001  # the suite must stay green
kit fix BUG-042 verify
```

1. **Red**: capture a failing regression test that reproduces the issue.
2. **Green**: apply the minimal change; refused until Red was observed.
3. **Refactor**: the suite must still pass.

**Slash Command Shortcut (Claude Code):**
```text
/kit-fix BUG-042 Expected login to succeed with valid credentials, but received 500 error
```

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
kit install --profile full-sdlc --stack node-typescript   # project scope
kit uninstall                                              # removes only what install created
```

Each plugin contains a `.claude-plugin/plugin.json` and a `hooks/hooks.json`
that declares its hooks module (`./register.ts`, TypeScript source loaded
directly by Claude Code — no build step).

To keep the kit out of a repository, install the plugins once at user scope
from this repo's marketplace (`claude plugin marketplace add <clone>`, then
`claude plugin install <name>@agentic-sdlc-kit --scope user`) and use
`kit attach local|global` for the working paths. To teach an AI host the
evidence-gated loop once, run `kit host install <host|all>`.

For setup guides covering **Claude Code**, **Cursor**, **Antigravity (AGY)**, and **CI/CD**, see [`docs/HOST_INTEGRATIONS.md`](docs/HOST_INTEGRATIONS.md).
