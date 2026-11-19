// packages/core/src/index.ts
//
// Barrel for @agentic-sdlc-kit/core.
//
// Architectural invariant (ARCHITECTURE.md §6):
//   - core imports ONLY from @agentic-sdlc-kit/contracts.
//   - core MUST NOT import any host runtime SDK (Claude Code, etc.).
//   - core MUST NOT import from claude-code-adapter or any future adapter.
//
// Adding an import here from any other @agentic-sdlc-kit/* package besides
// contracts is a Critical bug and fails scripts/check-architecture.ts.

export * from "./workflows/index.js";
export * from "./project-profile/index.js";
export * from "./policy/index.js";
export * from "./artifacts/index.js";
export * from "./discovery/index.js";
export * from "./specification/index.js";
export * from "./planning/index.js";
export * from "./tdd/index.js";
export * from "./stacks/index.js";
export * from "./learning/index.js";
export * from "./verification/index.js";
