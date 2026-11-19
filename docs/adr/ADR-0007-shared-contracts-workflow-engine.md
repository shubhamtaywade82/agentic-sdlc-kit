# ADR-0007: Shared contracts as the workflow engine; Markdown + validated structured metadata as persistent artifacts

Status: Accepted
Date: 2026-11-19
Milestone: M0 (frozen), implemented M1-03 + M1-07

## Context

The kit's workflow logic (state machine, profile generation, plan
validation, verification, policy evaluation) needs to be shared between
`core`, `cli`, the runtime adapters, and future extensions. The persistent
artifacts the workflow produces (project profile, workflow state,
verification report, implementation plan) need a format that is both
human-readable and machine-validatable.

## Decision

### Workflow engine = shared contracts

The "workflow engine" is not a separate runtime. It is the set of pure
functions in `packages/core` that operate on types defined in
`packages/contracts`. The contracts package is the single source of truth
for the workflow's data shapes.

- `WorkflowMode`, `WorkflowStatus`, `WorkflowState` live in `contracts`.
- `WorkflowEngine` (state-transition table) lives in `core` and operates on
  `WorkflowState`.
- Future extensions (stack packs, agents, commands) consume the same
  contracts; they do not redefine workflow types.

### Persistent artifacts = Markdown + validated structured metadata

Artifacts that humans read (specs, plans, ADRs, run reviews) are Markdown.
Artifacts that machines read (project profile, workflow state, verification
report) are JSON or YAML that conforms to a zod schema in `contracts`.

Every persistent artifact carries a `schemaVersion`. Breaking changes
require an ADR, a schema version bump, a migration function in
`core/artifacts/migrations/`, and updated tests.

The M1 `schemaVersion` values are `1` for `ProjectProfile`, `WorkflowState`,
`VerificationReport`, and `ImplementationPlan`.

## Alternatives considered

- **A separate "workflow engine" library.** Adds a layer; the engine is
  just pure functions on typed data, so a library adds indirection without
  value. Rejected.
- **All Markdown.** Human-readable, but parsing Markdown for state is
  fragile and lets drift sneak in. Rejected for machine-read artifacts.
- **All JSON.** Machine-readable, but specs and ADRs are unreadable as
  JSON. Rejected for human-read artifacts.
- **No schema versioning.** Faster today, but every breaking change later
  becomes a migration headache. Rejected.

## Consequences

- `packages/contracts/src/` is the most important package in the kit. Every
  change there is reviewed as if it were a public API change.
- The contracts package has the strictest test coverage requirements
  (`TESTING.md` §2: 80% statements and branches for `contracts`).
- Artifact writers in `core/artifacts/` validate before they write. An
  invalid artifact is never persisted.
- The `.ai-kit/` directory holds machine-read state; the `docs/` directory
  holds human-read artifacts. The boundary is enforced by
  `core/artifacts/writer.ts` which writes only to those roots
  (`SECURITY.md` §2).
- Future stack packs and Mods add new schemas by extending `contracts`, not
  by introducing parallel type systems.

## References

- `docs/architecture/ARCHITECTURE.md` §2.1, §2.2, §5
- `docs/contracts/CONTRACTS.md` §9
- `docs/workflows/WORKFLOWS.md` §2, §3
- `packages/contracts/src/`
- ADR-0008 (project configuration)
