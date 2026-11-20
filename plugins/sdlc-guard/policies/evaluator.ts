// plugins/sdlc-guard/policies/evaluator.ts
//
// Baseline policy evaluator for ClassifiedAction (the M10 surface, vendored
// from the kit's core so this plugin stays self-contained — a hooks module
// may only import its own files by relative path). Baseline rules:
//   - Non-interactive + destructive → deny (fail-closed).
//   - Interactive + destructive → require-approval (the hook asks via
//     $.ui.ask; an unanswered or dismissed question refuses).
//   - Non-destructive → allow.

import type { ClassifiedAction, PolicyContext, PolicyEvaluation } from './types';
import { isDestructive } from './types';

export function evaluateAction(action: ClassifiedAction, context: PolicyContext): PolicyEvaluation {
  if (!isDestructive(action)) {
    return { verdict: 'allow', reason: 'non-destructive action' };
  }
  if (!context.interactive) {
    return {
      verdict: 'deny',
      reason: 'non-interactive: destructive action denied (fail-closed)',
    };
  }
  return {
    verdict: 'require-approval',
    reason: `interactive: destructive action ${action.category} requires approval`,
    approver: 'user',
  };
}
