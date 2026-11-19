# ADR-0014: Mod SDK as the runtime-adapter layer

Status: Accepted
Date: 2026-11-19
Milestone: M10–M13 ( Mods ship from 0.7.0)

## Context

The kit's Mods (sdlc-guard, secret-guard, model-router, run-observer) run
inside Claude Code's hook engine. RESEARCH.md §6 recommends a "Mod
Development Framework" with typed event registration, reusable middleware,
testing utilities, and capability analysis — separate from the individual
Mods.

Without an SDK, each Mod would:

- Re-implement event type declarations (drift between Mods).
- Re-implement test harnessing (no way to test without launching Claude Code).
- Re-implement capability declarations (no static analysis).
- Tangle policy evaluation with event interception (violating the M10
  design principle: "Policy evaluation must be separate from event
  interception").

## Decision

Introduce `packages/mod-sdk/` as the runtime-adapter layer between the
kit's runtime-independent core and the Claude Code host runtime.

The SDK provides:

1. **Typed event registration** — `On` function with event-name → handler-type
   mapping for every event in RESEARCH.md §3 (tool.call, tool.check,
   turn.step, agent.spawn, prompt.submit, session._, ui._, etc.).
2. **Mods API surface** — typed `ModsApi` interface (`$.ui.log`, `$.fs.read`,
   `$.state.set`, etc.) that Mods use instead of reaching into the host.
3. **Mock runtime** — `MockRuntime` that captures registered handlers and
   lets tests fire events without launching Claude Code.
4. **Capability manifest** — `ModCapabilities` type (hooks, apiAccess,
   filesystemAccess, networkAccess, etc.) per RESEARCH.md §9.
5. **Middleware composition** — chain multiple handlers per event with
   predictable ordering.
6. **Static capability analysis** — parse a Mod's `register.ts` to extract
   declared events and API calls for validation.

The SDK does NOT import `claude-code`. It declares its own minimal event
type surface matching RESEARCH.md §3. When deployed in a real Claude Code
environment, the host's `on` is what actually dispatches events; the SDK's
types are advisory and the Mods API is a typed wrapper around the host's
API object.

## Alternatives considered

- **Each Mod imports `claude-code` directly.** Rejected: couples Mods to a
  specific host version; the architecture invariant (core is runtime-
  independent) would be violated at the Mod layer too; no testability
  without launching Claude Code.
- **No SDK; each Mod re-implements types.** Rejected: drift between Mods;
  no shared middleware; no capability analysis; RESEARCH.md explicitly
  recommends against this.
- **SDK lives inside `claude-code-adapter`.** Rejected: the adapter is the
  M1 boundary declaration; the SDK is a richer surface that builds on the
  adapter's contracts but adds middleware, testing, and capability
  analysis. Conflating them would force every Mod to depend on the full
  adapter.

## Consequences

- `packages/mod-sdk/` imports from `@agentic-sdlc-kit/contracts` and
  `@agentic-sdlc-kit/core` (for the policy evaluator and secret detector).
  It does NOT import `claude-code`.
- Each `plugins/<name>/` Mod imports `@agentic-sdlc-kit/mod-sdk` and
  registers handlers via the SDK's typed `On`.
- Mods are testable via `MockRuntime` without launching Claude Code.
- The installer (M15) reads each Mod's `ModCapabilities` manifest before
  enabling it; mismatched capabilities (e.g., a Mod that declares
  `networkAccess: false` but the source uses `http.fetch`) fail validation.
- The architectural invariant "core is runtime-independent" is preserved:
  `core` still imports only from `contracts`; `mod-sdk` sits between core
  and the host.

## References

- RESEARCH.md §6 (How I would architect your Mod SDK)
- RESEARCH.md §9 (ModCapabilities type)
- `packages/mod-sdk/`
- ADR-0004 (runtime-independent core)
- ADR-0005 (Claude Code as first adapter)
- ADR-0011 (shared security contracts before Mods)
