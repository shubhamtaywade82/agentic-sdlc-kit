// packages/contracts/src/index.ts
//
// Barrel for @agentic-sdlc-kit/contracts.
//
// Architectural invariant (ARCHITECTURE.md §6): this package imports
// nothing from sibling packages. Adding an import here from any other
// @agentic-sdlc-kit/* package is a Critical bug and fails the
// scripts/check-architecture.ts gate.

// M1 surface:
export * from './common/index.js';
export * from './project/index.js';
export * from './workflow/index.js';
export * from './specification/index.js';
export * from './planning/index.js';
export * from './verification/index.js';
export * from './policy/index.js';

// M8 surface:
export * from './application/index.js';
export * from './product/index.js';
export * from './architecture/index.js';
export * from './scaffolding/index.js';

// M9 surface:
export * from './maintenance/index.js';

// M10–M11 shared security surface:
export * from './runtime-guard/index.js';
export * from './secret-guard/index.js';

// M12 routing surface:
export * from './routing/index.js';

// M13 observer surface:
export * from './observer/index.js';

// M14 stack packs + patterns surface:
export * from './stack-pack/index.js';
export * from './patterns/index.js';

// M15 installer surface:
export * from './installer/index.js';

// M19 evaluation surface:
export * from './evaluation/index.js';

// M27–M35 self-evolution surface:
export * from './learning/index.js';
export * from './evolution/index.js';
