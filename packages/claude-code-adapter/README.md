# @agentic-sdlc-kit/claude-code-adapter

**Architectural boundary** between the Claude Code host runtime and the
runtime-independent core.

## M1 status: boundary declaration, not a working integration

This package declares the **contract surface** that future milestones
implement against. The host SDK (Claude Code plugin APIs) is **NOT**
imported in M1. M10 wires the SDK against these contracts when the
`sdlc-guard` Mod lands.

This is by design and is documented in ADR-0005. The package is not
presented as a working feature; it is the boundary declaration that
prevents later refactors of the core.

## Architectural invariant

- This package imports from `@agentic-sdlc-kit/contracts` only.
- The host SDK import (when added in M10) lives in this package only —
  never in `core`.
- `core` does not import this package; it consumes the `RuntimeEvent`
  contract defined here through its own type imports.

See `docs/architecture/ARCHITECTURE.md` §2.5 and ADR-0004, ADR-0005.

## Public surface (M1)

- `contracts/runtime-event.ts` — `RuntimeEvent` discriminated union.
- `events/translator.ts` — `EventTranslator` interface + identity impl.
- `middleware/approval-gate.ts` — `ApprovalGate` interface + default impl.

## The non-negotiable limitation

Claude Code Mods (and equivalent host plugins) execute **with the host
process's access to the machine**. They are not an OS sandbox. The
approval gate evaluates policy and prompts the user; it does not isolate.
Real isolation comes from OS permissions, containers, restricted
credentials, and deployment controls. See `docs/security/SECURITY.md` §4
and ADR-0009.
