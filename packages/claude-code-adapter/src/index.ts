// packages/claude-code-adapter/src/index.ts
//
// Barrel for @agentic-sdlc-kit/claude-code-adapter.
//
// M1: this package is a BOUNDARY DECLARATION, not a working integration.
// The host SDK is NOT imported. M10 wires the SDK against these contracts.
//
// See ADR-0005 and packages/claude-code-adapter/README.md.

export * from './contracts/index.js';
export * from './events/index.js';
export * from './middleware/index.js';
export * from './mods/index.js';
