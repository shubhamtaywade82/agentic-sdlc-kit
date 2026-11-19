// packages/core/src/policy/evaluator.ts
//
// Pure policy evaluator. The adapter (claude-code-adapter) is responsible
// for applying the verdict to the host; this function computes the verdict
// without side effects.
//
// INVARIANT (SECURITY.md §3.2): A bypass that silently turns `deny` into
// `allow` is a Critical bug. The verdict is terminal for a given action;
// no later stage may flip it.
//
// Default policy (M1 baseline; M10 expands per-action thresholds):
//
//   action                  interactive            non-interactive
//   ----------------------- ---------------------- ----------------------
//   file.delete             require-approval       deny
//   file.bulk-modify        require-approval       deny
//   db.migrate              require-approval       deny
//   db.production-mutate    require-approval       deny
//   git.force-push          require-approval       deny
//   release.deploy          require-approval       deny
//   secret.modify           require-approval       deny
//   dependency.remove       require-approval       deny
//
// In M1, no action is `allow` by default. M10 will introduce scope-based
// allow rules (e.g., single-file delete with scope ≤ N).

import type { PolicyAction, PolicyContext, PolicyDecision } from '@agentic-sdlc-kit/contracts';

const APPROVER = 'user';

const requireApproval = (action: PolicyAction, reason: string): PolicyDecision => ({
  action,
  verdict: 'require-approval',
  reason,
  approver: APPROVER,
});

const deny = (action: PolicyAction, reason: string): PolicyDecision => ({
  action,
  verdict: 'deny',
  reason,
});

const allow = (action: PolicyAction, reason: string): PolicyDecision => ({
  action,
  verdict: 'allow',
  reason,
});

/**
 * Evaluate a policy decision for the given action and context.
 *
 * M1 baseline policy:
 *   - Interactive: every destructive action requires approval.
 *   - Non-interactive: every destructive action is denied (fail-closed).
 *   - No action is `allow` by default in M1.
 */
export function evaluate(action: PolicyAction, context: PolicyContext): PolicyDecision {
  // Fail-closed when non-interactive.
  if (!context.interactive) {
    return deny(action, 'non-interactive: destructive action denied (fail-closed)');
  }
  // M1: no allow rules yet. Every action requires explicit approval.
  // M10 will add scope-based allow rules here.
  return requireApproval(action, `interactive: action ${action} requires approval`);
}

/**
 * Apply an Approval to a require-approval decision. The verdict becomes
 * `allow` only if the approver matches. If the decision was `deny`, the
 * approval has no effect (INVARIANT: deny cannot become allow).
 */
export function applyApproval(
  decision: PolicyDecision,
  approval: { approver: string; action: PolicyAction },
): PolicyDecision {
  if (decision.verdict === 'deny') {
    // INVARIANT: deny is terminal.
    return decision;
  }
  if (decision.verdict === 'allow') {
    return decision;
  }
  // require-approval
  if (approval.action !== decision.action) {
    return decision;
  }
  if (approval.approver !== decision.approver) {
    return deny(decision.action, 'approval approver mismatch');
  }
  return allow(decision.action, `approved by ${approval.approver}`);
}

/**
 * M1 escape hatch for tests: explicitly allow a single-file delete with
 * scope=1. This is a placeholder for the M10 scope-based rules; it exists
 * in M1 so that the evaluator interface can be exercised without
 * hard-coding `deny` everywhere.
 */
export function maybeAllowScopedDelete(context: PolicyContext): PolicyDecision | undefined {
  if (context.interactive && context.scopeFileCount === 1) {
    return allow('file.delete', 'single-file delete in interactive mode');
  }
  return undefined;
}
