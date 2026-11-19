// packages/mod-sdk/src/index.ts
//
// Barrel for @agentic-sdlc-kit/mod-sdk.
//
// Architectural invariant: this package imports from
// @agentic-sdlc-kit/contracts and @agentic-sdlc-kit/core (for the policy
// evaluator and secret detector that Mods consume). It does NOT import
// `claude-code`. The host SDK types are declared by the SDK itself (see
// types/events.ts).

export * from './types/index.js';
export * from './capabilities/index.js';
export * from './middleware/index.js';
export * from './testing/index.js';
