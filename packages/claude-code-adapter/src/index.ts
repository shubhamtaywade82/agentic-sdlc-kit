// packages/claude-code-adapter/src/index.ts
//
// Barrel for @agentic-sdlc-kit/claude-code-adapter.
//
// This package is the HOST adapter boundary (agent -> Kit): the surface a
// host runtime (Claude Code) uses to invoke kit commands, tools, and
// Mods. The host SDK is NOT imported here — integrations live in the
// host's own plugin/runtime layer.
//
// The old "M10 wires the SDK against these contracts" assumption is
// SUPERSEDED by ADR-0019: the inverse direction (Kit -> agent) is the
// PROVIDER adapter role, built separately behind the AgentProvider
// interface (PR4+), and this package does NOT silently become both.
//
// See ADR-0005, ADR-0019 §2, and packages/claude-code-adapter/README.md.

export * from './contracts/index.js';
export * from './events/index.js';
export * from './middleware/index.js';
export * from './mods/index.js';
