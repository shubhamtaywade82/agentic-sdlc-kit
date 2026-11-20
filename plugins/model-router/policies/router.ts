// plugins/model-router/policies/router.ts
//
// The router itself (M12-06, M12-07, M12-08). Takes a RoutingContext and
// a RoutingPolicy and returns a RoutingDecision.
//
// INVARIANT: explicit user model selections are ALWAYS preserved (post-M7
// §6). The router never overrides an explicit choice unless an escalation
// policy explicitly authorizes it.

import type {
  RoutingContext,
  RoutingDecision,
  RoutingPolicy,
  RoutingRule,
} from './types';

export function findMatchingRule(
  ctx: RoutingContext,
  policy: RoutingPolicy,
): RoutingRule | undefined {
  for (const rule of policy.rules) {
    if (rule.taskType !== '*' && rule.taskType !== ctx.taskType) continue;
    if (rule.complexity !== '*' && rule.complexity !== ctx.complexity) continue;
    if (rule.risk !== '*' && rule.risk !== ctx.risk) continue;
    return rule;
  }
  return undefined;
}

export function route(ctx: RoutingContext, policy: RoutingPolicy): RoutingDecision {
  // INVARIANT: preserve explicit user model + effort.
  if (ctx.explicitUserModel !== undefined) {
    return {
      model: ctx.explicitUserModel,
      effort: ctx.explicitUserEffort ?? 'medium',
      reason: 'explicit user model selection preserved',
      isFallback: false,
      isEscalation: false,
    };
  }
  // Escalation: if previous outcome was a failure, escalate.
  if (ctx.previousOutcome === 'failed-verification' || ctx.previousOutcome === 'failed-review') {
    return {
      model: policy.defaultModel,
      effort: 'high',
      reason: `escalation after ${ctx.previousOutcome}`,
      isFallback: false,
      isEscalation: true,
    };
  }
  // Static policy match.
  const rule = findMatchingRule(ctx, policy);
  if (rule) {
    return {
      model: rule.model,
      effort: rule.effort,
      reason: rule.reason,
      isFallback: false,
      isEscalation: false,
      matchedRuleId: rule.id,
    };
  }
  // Default.
  return {
    model: policy.defaultModel,
    effort: policy.defaultEffort,
    reason: 'no rule matched; default model + effort',
    isFallback: false,
    isEscalation: false,
  };
}
