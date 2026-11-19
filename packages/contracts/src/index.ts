// packages/contracts/src/index.ts
//
// Barrel for @agentic-sdlc-kit/contracts.
//
// Architectural invariant (ARCHITECTURE.md §6): this package imports
// nothing from sibling packages. Adding an import here from any other
// @agentic-sdlc-kit/* package is a Critical bug and fails the
// scripts/check-architecture.ts gate.

export * from "./common/index.js";
export * from "./project/index.js";
export * from "./workflow/index.js";
export * from "./specification/index.js";
export * from "./planning/index.js";
export * from "./verification/index.js";
export * from "./policy/index.js";
export * from "./learning/index.js";
