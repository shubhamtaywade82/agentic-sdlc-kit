// packages/contracts/src/agent/index.ts
//
// M36 agent execution surface (ADR-0019, ADR-0020). Provider-neutral
// contracts for orchestrating AI agent execution: capabilities, sessions,
// events, requests/results, the provider behavior interface, and the
// error taxonomy.
//
// Architectural invariant (ARCHITECTURE.md §6): this surface imports
// nothing from sibling @agentic-sdlc-kit/* packages, and a provider SDK
// (Claude, Codex, ...) MUST NOT be imported here. Provider-specific code
// lives behind the AgentProvider interface in a provider package.

export * from './capability.js';
export * from './session.js';
export * from './errors.js';
export * from './events.js';
export * from './execution.js';
export * from './provider.js';
export * from './policy.js';
