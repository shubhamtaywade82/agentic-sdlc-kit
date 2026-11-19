# ADR-0005: Claude Code as the first runtime adapter

Status: Accepted
Date: 2026-11-19
Milestone: M0 (frozen), boundary declared in M1, wired in M10

## Context

The kit's first runtime target is Claude Code, which exposes plugin hooks,
tool-call events, model-request events, and approval controls. We need to
decide: do we implement the Claude Code integration directly inside `core`,
or do we treat Claude Code as one adapter among many possible adapters?

## Decision

Claude Code is the **first runtime adapter**, not the owner of the product's
workflow logic. In M1 we declare the boundary by shipping
`packages/claude-code-adapter` with:

- `contracts/runtime-event.ts` — the `RuntimeEvent` union the core consumes.
- `events/translator.ts` — the `translateHostEvent` interface.
- `middleware/approval-gate.ts` — the approval-gate interface.

We **do not** import the Claude Code SDK in M1. The adapter in M1 is a
boundary declaration: it compiles, exports the contract surface, and is
covered by unit tests that prove the contract is internally consistent.
The host SDK import lands in M10 when the `sdlc-guard` Mod is wired.

## Alternatives considered

- **Implement Claude Code integration inside `core` in M1.** Violates
  ADR-0004 and locks the workflow to one runtime. Rejected.
- **Ship the adapter as a fully working integration in M1.** Tempting, but
  the workflow logic the adapter would gate (M10 governance, M11 secrets,
  M12 router, M13 observer) does not exist yet. A working integration
  against nothing is a placeholder dressed as a feature. Violates
  `REQUIREMENTS.md` NFR-6.1. Rejected.
- **Defer the adapter package to M10.** Saves a package in M1, but loses
  the boundary declaration that prevents later refactors. The contract
  surface must exist before the workflow logic that consumes it.

## Consequences

- The `claude-code-adapter` package is part of M1 and is exported from the
  workspace. Its public surface is intentionally small.
- The package README explicitly states "boundary declaration, not a working
  integration" to avoid presenting it as a feature
  (`REQUIREMENTS.md` NFR-6.1).
- The host SDK is not a dependency in M1. When M10 wires the SDK, the
  dependency is added to `claude-code-adapter/package.json` only — never to
  `core`.
- Future runtime adapters (Codex in M18, others later) mirror this package:
  they implement the same translator and middleware interfaces against a
  different host SDK.
- The Claude Code installed version's declarations are the final authority
  on what events are actually available. Where this differs from our
  contract, the contract is updated by an ADR.

## References

- `docs/architecture/ARCHITECTURE.md` §2.5
- `docs/modules/MODULES.md` §2
- `packages/claude-code-adapter/README.md`
- ADR-0004 (runtime-independent core)
