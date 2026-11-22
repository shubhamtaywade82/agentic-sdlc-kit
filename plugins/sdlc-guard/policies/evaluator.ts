// plugins/sdlc-guard/policies/evaluator.ts
//
// Baseline rules:
//   - Non-destructive                      -> allow.
//   - Destructive, non-interactive         -> deny (fail closed).
//   - Destructive, interactive             -> require-approval (the host asks).

import { isDestructive, type ClassifiedAction, type PolicyContext, type PolicyEvaluation } from './types';

export function evaluateAction(action: ClassifiedAction, context: PolicyContext): PolicyEvaluation {
  if (!isDestructive(action)) {
    return { verdict: 'allow', reason: 'non-destructive action' };
  }
  if (!context.interactive) {
    return { verdict: 'deny', reason: `${action.category}: destructive action denied (non-interactive, fail-closed)` };
  }
  return { verdict: 'require-approval', reason: `${action.category}: destructive action requires approval` };
}
