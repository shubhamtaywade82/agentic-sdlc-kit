// plugins/sdlc-guard/policies/evaluator.ts
//
// Thin re-export of the M10 policy evaluator from core. The Mod's register.ts
// calls this so the policy logic lives in one place (core) and is testable
// without the SDK.

export { evaluateClassified as evaluateAction } from '@agentic-sdlc-kit/core';
