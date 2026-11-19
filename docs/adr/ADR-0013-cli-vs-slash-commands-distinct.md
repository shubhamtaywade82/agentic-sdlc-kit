# ADR-0013: CLI commands and slash commands are distinct; not interchangeable

Status: Accepted
Date: 2026-11-19
Milestone: M8+ (frozen)

## Context

The kit exposes two kinds of user-facing operations:

1. **Slash commands** (`/kit:feature`, `/kit:app`, `/kit:fix`,
   `/kit:refactor`) — AI-facing, initiate a guided workflow that an agent
   executes with the kit's contracts and state machines.
2. **CLI commands** (`kit init`, `kit inspect`, `kit verify`, `kit doctor`,
   `kit runs`, `kit install`) — deterministic, well-defined operations
   that run without an agent in the loop.

The post-M7 roadmap §15 warns: "Keep the distinction clear: an AI-facing
command initiates a guided workflow; a CLI command executes a well-defined
operation. They should not be interchangeable just because their names
look similar."

## Decision

The two command surfaces are **distinct** and are not interchangeable.

- **Slash commands** live under `plugins/commands/` (when shipped from
  M3+). They are markdown-driven workflow entry points that load Skills
  and drive the workflow engine in `core`. They never execute deterministic
  operations directly; they delegate to `core` and `cli`.
- **CLI commands** live under `packages/cli/src/commands/`. They are
  TypeScript modules that implement the `Command` interface and execute
  deterministic operations. They never initiate an AI-guided workflow; if a
  workflow is needed, they print "run /kit:<name> from your AI assistant"
  and exit.

The naming convention keeps them visually distinct:

- Slash commands: `/kit:feature`, `/kit:app`, `/kit:fix`, `/kit:refactor`,
  `/kit:optimize`, `/kit:review`, `/kit:release`.
- CLI commands: `kit init`, `kit inspect`, `kit doctor`, `kit verify`,
  `kit validate-spec`, `kit validate-plan`, `kit runs`, `kit audit`,
  `kit release-check`, `kit install`, `kit update`, `kit uninstall`.

A CLI command MAY report workflow state (e.g., `kit runs show RUN-001`)
but MAY NOT drive a workflow forward. A slash command MAY invoke a CLI
command (e.g., `/kit:feature` runs `kit verify` as its verification step)
but the slash command itself is the workflow driver.

## Alternatives considered

- **Unify under one namespace.** Rejected: would blur the deterministic /
  AI-driven boundary that `WORKFLOWS.md` §9.D relies on. "Do not use an
  LLM to validate facts a deterministic program can verify more reliably."
- **CLI commands can drive workflows.** Rejected: a CLI command has no
  agent in the loop; it cannot make the judgment calls a workflow requires
  (e.g., "is this requirement ambiguous?"). Pretending it can produces
  brittle, hallucination-prone behavior.
- **Slash commands can execute deterministic ops directly.** Rejected:
  the slash command runs in the agent's context with the agent's
  permissions; deterministic ops should run in the kit's context with the
  kit's policy gates. Mixing them bypasses the policy evaluator.

## Consequences

- `packages/cli/src/commands/` grows deterministic commands only.
- `plugins/commands/` (M3+) grows slash commands only.
- The CLI `app`, `fix`, `refactor`, `optimize` commands shipped in 0.6.0
  are **skeletons that print "use /kit:app from your AI assistant"** and
  optionally show workflow state. They are NOT workflow drivers.
- The dispatcher in `packages/cli/src/application/dispatcher.ts` registers
  CLI commands only; it never registers a slash command.
- Tests for CLI commands assert deterministic behavior; tests for slash
  commands (when they ship) assert workflow-initiation behavior.

## References

- Post-M7 roadmap §15 (shared Skills, agents, commands)
- `docs/workflows/WORKFLOWS.md` §9.D (separate deterministic and AI-driven)
- `packages/cli/src/commands/`
- ADR-0006 (independently installable plugins)
