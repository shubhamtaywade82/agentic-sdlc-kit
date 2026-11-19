# ADR-0001: The SDLC engine stays runtime-independent

Date: 2026-11-19 · Status: accepted

## Context

The kit targets multiple AI coding hosts (Claude Code, Cursor, Windsurf,
Copilot, Gemini CLI/OpenCode) and must survive hosts appearing, evolving, or
disappearing. The proposal's §16 names this the single most important
architectural decision.

## Decision

The core — lifecycle contracts, spec/plan formats, the project profile, the
`kit` CLI validators/verifier, report schemas — has **zero dependencies on any
agent host**. It is plain TypeScript on Node 18+ (CLI) and markdown/YAML
contracts. Host-specific layers (slash commands, skills packaging, mods) are
adapters: `core/` content is mapped per adapter by the installer; runtime
mods bind the same policy cores to host events.

## Consequences

- (+) New hosts require only a distribution adapter, not a port.
- (+) Deterministic gates run identically in CI, locally, and inside agents.
- (+) Mods can fail/absent without degrading the engineering workflow.
- (−) Some host capabilities (e.g. per-turn model routing outside Claude
  Code) are unavailable cross-host; the kit degrades to guidance instead of
  enforcement there.
- (−) Policy logic is vendored per mod (self-contained plugins) rather than
  shared at runtime — accepted duplication, covered by shared contracts and
  mirrored tests (see ADR-0006).
