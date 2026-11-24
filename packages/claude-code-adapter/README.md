# @agentic-sdlc-kit/claude-code-adapter

**Architectural boundary** between the Claude Code host runtime and the
runtime-independent core.

## Status

This package is the **host adapter boundary** (agent -> Kit): the contract
surface a host runtime such as Claude Code uses to invoke kit commands, tools
and Mods. It declares contracts, an event translator, an approval-gate
interface and the Mod policy contracts. It is not itself a Claude Code plugin.

- The host SDK (Claude Code's plugin API) is **not imported here**, by design.
  The four Mods under `plugins/` (`sdlc-guard`, `secret-guard`, `model-router`,
  `run-observer`) are the working Claude Code integration and import the host
  types themselves.
- The Kit -> agent direction (the `AgentProvider` role) is a separate adapter,
  built behind its own interface in `packages/cli`; this package does not
  become both (ADR-0019 §2).

*History:* at M1 this package was only a boundary declaration, and ADR-0005
assumed M10 would wire the SDK into it. That assumption was superseded by
ADR-0019 and the Mods work (ADR-0014, ADR-0015).

## Architectural invariant

- This package imports from `@agentic-sdlc-kit/contracts` only.
- If the host SDK is ever imported by this package, it stays here and never
  in `core`. Today the plugins own that import.
- `core` does not import this package; it consumes the `RuntimeEvent`
  contract defined here through its own type imports.

See `docs/architecture/ARCHITECTURE.md` §2.5 and ADR-0004, ADR-0005.

## Public surface

- `contracts/runtime-event.ts` — `RuntimeEvent` discriminated union.
- `events/translator.ts` — `EventTranslator` interface + identity impl.
- `middleware/approval-gate.ts` — `ApprovalGate` interface + default impl.
- `mods/*` — policy contracts for the four Mods (`sdlc-guard`, `secret-guard`,
  `model-router`, `run-observer`).

## The non-negotiable limitation

Claude Code Mods (and equivalent host plugins) execute **with the host
process's access to the machine**. They are not an OS sandbox. The
approval gate evaluates policy and prompts the user; it does not isolate.
Real isolation comes from OS permissions, containers, restricted
credentials, and deployment controls. See `docs/security/SECURITY.md` §4
and ADR-0009.
