// packages/testing/src/index.ts
//
// Barrel for @agentic-sdlc-kit/testing.
//
// Imports only from @agentic-sdlc-kit/contracts and vitest. Architectural
// invariant (ARCHITECTURE.md §6): this package does not import from core,
// cli, or any adapter.

export * from './fixtures/index.js';
export * from './assertions/index.js';
export * from './validators/index.js';
export * from './helpers/index.js';
export * from './conformance/tier-c.js';
