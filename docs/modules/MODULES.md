# MODULES.md — Agentic SDLC Kit

Status: M0 frozen. Catalog of every module type the kit will ship across all
milestones. Modules marked **(M1)** are part of this release; the rest are
declared here as the contract surface later milestones implement against, so
that the M1 architecture does not have to be refactored when they arrive.

## 1. Module taxonomy

The kit is composed of seven module types:

| Type        | Lifecycle              | Lives under          | First milestone |
| ----------- | ---------------------- | -------------------- | --------------- |
| Package     | Build + publish        | `packages/`          | M1              |
| Skill       | On-demand instruction  | `plugins/skills/`    | M3              |
| Agent       | Independent analysis   | `plugins/agents/`    | M4              |
| Command     | User-invoked workflow  | `plugins/commands/`  | M3              |
| Mod         | Runtime governance     | `plugins/<name>/`    | M10             |
| Stack pack  | Stack-specific knowledge | `stack-packs/`     | M14             |
| Pattern     | Language-independent design reference | `patterns/` | M14             |

A **plugin** is any installable bundle of one or more of these. An
**installer profile** (M15) selects which plugins to install in a given
repository.

## 2. Packages (M1)

| Package                  | Purpose                                                                 | Status |
| ------------------------ | ----------------------------------------------------------------------- | ------ |
| `@agentic-sdlc-kit/contracts` | Shared types and zod schemas. Depends on nothing.                  | M1     |
| `@agentic-sdlc-kit/core`      | Runtime-independent workflow engine, profile generator, artifacts. | M1     |
| `@agentic-sdlc-kit/cli`       | User-facing `kit` executable.                                       | M1     |
| `@agentic-sdlc-kit/testing`   | Shared test utilities.                                              | M1     |
| `@agentic-sdlc-kit/claude-code-adapter` | Host runtime boundary.                                    | M1     |

See `ARCHITECTURE.md` §2 for the public surface of each.

## 3. Skills (declared; ship from M3)

| Skill                          | Purpose                                                       | Milestone |
| ------------------------------ | ------------------------------------------------------------ | --------- |
| `requirements-engineering`     | Transform a request into a validated SPEC + acceptance + BDD | M3        |
| `repo-discovery`               | Inspect a repository and propose a profile                  | M2        |
| `tdd-bdd`                      | Drive implementation through focused tests                  | M5        |
| `system-design`                | Analyze architecture before proposing changes               | M4        |
| `implementation-planning`      | Produce a dependency-aware vertical-slice plan              | M4        |
| `design-pattern-selection`     | Recommend a pattern only where it addresses a real problem  | M4        |
| `code-quality`                 | Refactor and lint hygiene                                    | M5        |

A Skill is a single `SKILL.md` file with a YAML front-matter block declaring
`schemaVersion`, `name`, `requiredCapabilities`, `appliesToStacks`, and
`invokedBy` (the command or agent that loads it).

## 4. Agents (declared; ship from M4)

| Agent                  | Purpose                                                       | Milestone |
| ---------------------- | ------------------------------------------------------------ | --------- |
| `repository-analyst`   | Read-only inspection of the target repository                | M4        |
| `architecture-reviewer`| Independent review of plans and diffs                        | M7        |

Agents are declared with an `AGENT.md` that lists required Skills and the
contract surface they consume from `core`.

## 5. Commands (declared; ship from M3)

| Command         | Purpose                                                       | Milestone |
| --------------- | ------------------------------------------------------------ | --------- |
| `/kit:spec`     | Generate a feature specification                             | M3        |
| `/kit:requirements` | Refine requirements into acceptance criteria             | M3        |
| `/kit:plan`     | Produce an implementation plan                               | M4        |
| `/kit:feature`  | End-to-end incremental feature workflow                      | M7        |
| `/kit:app`      | Greenfield application workflow                              | M8        |
| `/kit:fix`      | Bug-fix workflow                                             | M9        |
| `/kit:refactor` | Refactoring workflow                                          | M9        |

CLI subcommands (`kit init`, `kit inspect`, `kit doctor`, `kit verify`,
`kit runs`, `kit install`, `kit uninstall`, `kit update`) are not slash
commands; they live under `packages/cli/src/commands/`.

## 6. Mods (declared; ship from M10)

| Mod              | Purpose                                                       | Milestone |
| ---------------- | ------------------------------------------------------------ | --------- |
| `sdlc-guard`     | Approval gates for destructive operations                    | M10       |
| `secret-guard`   | Detect and redact secrets in reads, writes, git ops          | M11       |
| `model-router`   | Context-aware model + effort selection                       | M12       |
| `run-observer`   | Collect run events to `.ai-kit/reports/runs/`                | M13       |

A Mod is a plugin bundle with a `.claude-plugin/` manifest, `hooks/`,
`policies/`, and `tests/`. The Mod never directly performs the destructive
operation; it evaluates a `PolicyDecision` and the adapter applies it.

## 7. Stack packs (declared; ship from M14)

| Pack               | Contents (high level)                                                              |
| ------------------ | --------------------------------------------------------------------------------- |
| `node-typescript`  | Express, APIs, modules, async patterns, validation, testing                       |
| `react-typescript` | Components, hooks, state, forms, accessibility, frontend testing                  |
| `ruby-rails`       | MVC, services, Active Record, jobs, API design, RSpec, migrations                 |
| `python`           | Application architecture, type safety, testing, packaging                         |
| `go`               | Modules, interfaces, concurrency, error handling, testing                         |

Each stack pack contains `manifest.json`, `skills/`, `references/`,
`templates/`, `scripts/`, `policies/`, and `tests/`.

## 8. Patterns (declared; ship from M14)

Language-independent concept catalog under `patterns/`:

| Category          | Examples                                                              |
| ----------------- | -------------------------------------------------------------------- |
| Architecture      | Layered, hexagonal, ports-and-adapters, CQRS                          |
| Creational        | Factory, Builder, Abstract Factory, Prototype, Singleton (cautioned)  |
| Structural        | Adapter, Decorator, Facade, Composite, Proxy                          |
| Behavioral        | Strategy, State, Observer, Command, Chain of Responsibility           |
| Resilience        | Circuit Breaker, Retry with backoff, Bulkhead, Idempotency            |
| Data              | Repository, Unit of Work, Identity Map, Event Sourcing                |
| Testing           | Test Pyramid, Fixture, Fake vs Stub vs Mock, Characterization Test    |

Every pattern entry explains: when it applies, when it does not, and the
simpler alternative. Patterns are linked from stack packs, not duplicated.

## 9. Installer profiles (declared; ship from M15)

| Profile        | Contents                                                              |
| -------------- | -------------------------------------------------------------------- |
| `minimal`      | Core instructions, essential commands, essential Skills               |
| `full-sdlc`    | All core workflows, agents, scripts, templates                        |
| `runtime`      | Optional Mods (governance, security, routing, observation)            |
| `stack-specific` | Selected stack pack(s)                                              |

`kit install --profile <name> [--stack <pack>]` selects a profile. The
installer is idempotent, ownership-tracked, and safely uninstallable.

## 10. Module cross-reference

| Module            | Depends on (build-time)                                       | Required by (runtime)       |
| ----------------- | ------------------------------------------------------------- | --------------------------- |
| contracts         | (none)                                                        | every other package         |
| core              | contracts                                                     | cli                         |
| cli               | core, contracts                                               | user                        |
| testing           | contracts, vitest                                             | dev only                    |
| claude-code-adapter | contracts (+ host SDK from M10)                             | runtime host (M10+)         |
| Stack pack        | contracts (types only)                                        | skills, agents, commands    |
| Mod               | contracts (policy types), claude-code-adapter (M10+)          | runtime host                |

## 11. What M1 does **not** ship

To prevent scope explosion (PRODUCT.md §4), M1 ships **only** the five
packages in §2. Skills, agents, commands (slash), Mods, stack packs,
patterns, and installer profiles are **declared** here but not implemented.
Their absence is correct and intentional; their contract surfaces are
declared in `CONTRACTS.md` so M2+ work does not refactor the core.
