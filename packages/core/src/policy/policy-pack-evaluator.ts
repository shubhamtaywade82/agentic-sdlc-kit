// packages/core/src/policy/policy-pack-evaluator.ts
//
// M10 policy pack evaluator. Takes a ClassifiedAction and a PolicyPack
// and returns a PolicyEvaluation by finding the first matching rule.
//
// This extends the M1 baseline evaluator (which always returns
// require-approval or deny) with structured rule matching. The M1
// evaluator remains for back-compat; this is the M10 surface.
//
// NOTE: We return a PolicyEvaluation (verdict + reason + approver? +
// matchedRuleId?) rather than a M1 PolicyDecision, because PolicyDecision's
// `action` field uses the M1 PolicyAction enum (8 entries) which does not
// overlap cleanly with the M10 ActionCategory enum (23 entries). The
// caller already has the action; the audit event builder takes it
// separately.

import type {
  ClassifiedAction,
  PolicyContext,
  PolicyPack,
  PolicyRule,
  Verdict,
} from '@agentic-sdlc-kit/contracts';
import { isDestructive } from '@agentic-sdlc-kit/contracts';

/**
 * The result of evaluating a classified action against a policy pack.
 * The caller combines this with the original action to build an audit
 * event (see policy/audit.ts).
 */
export interface PolicyEvaluation {
  verdict: Verdict;
  reason: string;
  approver?: string;
  matchedRuleId?: string;
}

/**
 * Evaluate a single rule against a classified action. Returns true if the
 * rule matches (category, impact, and optional threshold).
 */
export function ruleMatches(action: ClassifiedAction, rule: PolicyRule): boolean {
  if (rule.category !== '*' && rule.category !== action.category) return false;
  if (rule.impact !== '*' && rule.impact !== action.impact) return false;
  if (rule.threshold) {
    const fieldValue = action.scope.fileCount ?? 0;
    const { op, value } = rule.threshold;
    switch (op) {
      case 'gt':
        if (!(fieldValue > value)) return false;
        break;
      case 'gte':
        if (!(fieldValue >= value)) return false;
        break;
      case 'lt':
        if (!(fieldValue < value)) return false;
        break;
      case 'lte':
        if (!(fieldValue <= value)) return false;
        break;
    }
  }
  return true;
}

/**
 * Find the first matching rule in a policy pack for the given action.
 */
export function findMatchingRule(
  action: ClassifiedAction,
  pack: PolicyPack,
): PolicyRule | undefined {
  for (const rule of pack.rules) {
    if (ruleMatches(action, rule)) return rule;
  }
  return undefined;
}

/**
 * Evaluate a classified action against a policy pack. Returns a
 * PolicyEvaluation. If no rule matched, the pack's defaultVerdict is used.
 *
 * In non-interactive contexts where appliesNonInteractive is false, the
 * result is always `deny` (fail-closed) regardless of the rules.
 */
export function evaluateWithPack(
  action: ClassifiedAction,
  pack: PolicyPack,
  context: { interactive: boolean },
): PolicyEvaluation {
  if (!context.interactive && !pack.appliesNonInteractive) {
    return {
      verdict: 'deny',
      reason: `non-interactive: policy pack ${pack.id} does not apply; fail-closed`,
    };
  }
  const rule = findMatchingRule(action, pack);
  if (!rule) {
    return {
      verdict: pack.defaultVerdict,
      reason: `no rule matched; default verdict for pack ${pack.id}`,
    };
  }
  return {
    verdict: rule.verdict,
    reason: rule.reason,
    ...(rule.verdict === 'require-approval' ? { approver: 'user' } : {}),
    matchedRuleId: rule.id,
  };
}

/**
 * Baseline evaluator for ClassifiedAction (M10 surface). Uses the M1
 * baseline rules without a policy pack:
 *   - Non-interactive + destructive → deny (fail-closed).
 *   - Interactive + destructive → require-approval.
 *   - Non-destructive → allow.
 *
 * This is the function Mods call when no policy pack is configured. It
 * accepts the M10 ClassifiedAction (23 categories) rather than the M1
 * PolicyAction (8 categories).
 */
export function evaluateClassified(
  action: ClassifiedAction,
  context: PolicyContext,
): PolicyEvaluation {
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
