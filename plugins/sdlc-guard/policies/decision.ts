// plugins/sdlc-guard/policies/decision.ts
//
// Pure decision for one Bash command: the strictest verdict across every
// destructive action the classifier finds. deny beats ask beats allow.

import { classifyCommand } from './classify';
import { evaluateAction } from './evaluator';
import type { PolicyContext } from './types';

export type HookDecision =
  | { kind: 'allow' }
  | { kind: 'ask'; reason: string }
  | { kind: 'deny'; reason: string };

export function decideBash(command: string, context: PolicyContext = { interactive: true }): HookDecision {
  let pending: string | null = null;
  for (const action of classifyCommand(command)) {
    const evaluation = evaluateAction(action, context);
    if (evaluation.verdict === 'deny') return { kind: 'deny', reason: `sdlc-guard: ${evaluation.reason}` };
    if (evaluation.verdict === 'require-approval') pending ??= `sdlc-guard: ${evaluation.reason}`;
  }
  return pending === null ? { kind: 'allow' } : { kind: 'ask', reason: pending };
}
