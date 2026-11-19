// packages/contracts/src/policy/policy.ts
//
// Policy decision contract. The evaluator in core.policy.evaluator is a
// pure function: evaluate(action, context, policy) => PolicyDecision.
//
// Critical invariant (see docs/security/SECURITY.md §3.2):
//   A bypass that silently turns `deny` into `allow` is a Critical bug.
//   The verdict is terminal for a given action; no later stage may flip it.
//
// See docs/contracts/CONTRACTS.md §7 and ADR-0009.

import { z } from 'zod';

export const PolicyActionSchema = z.enum([
  'file.delete',
  'file.bulk-modify',
  'db.migrate',
  'db.production-mutate',
  'git.force-push',
  'release.deploy',
  'secret.modify',
  'dependency.remove',
]);
export type PolicyAction = z.infer<typeof PolicyActionSchema>;

export const VerdictSchema = z.enum(['allow', 'deny', 'require-approval']);
export type Verdict = z.infer<typeof VerdictSchema>;

export const PolicyDecisionSchema = z.discriminatedUnion('verdict', [
  z.object({
    action: PolicyActionSchema,
    verdict: z.literal('allow'),
    reason: z.string().min(1),
  }),
  z.object({
    action: PolicyActionSchema,
    verdict: z.literal('deny'),
    reason: z.string().min(1),
  }),
  z.object({
    action: PolicyActionSchema,
    verdict: z.literal('require-approval'),
    reason: z.string().min(1),
    approver: z.string().min(1),
  }),
]);
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const ApprovalSchema = z.object({
  action: PolicyActionSchema,
  approver: z.string().min(1),
  grantedAt: z.string().min(1),
  rationale: z.string().min(1),
});
export type Approval = z.infer<typeof ApprovalSchema>;

/**
 * Context passed to the policy evaluator. M1 only carries the fields
// needed for the baseline invariants; M10 adds scope, file counts, env
// (interactive vs CI), and the active approval token.
 */
export const PolicyContextSchema = z.object({
  interactive: z.boolean(),
  scopeFileCount: z.number().int().nonnegative().optional(),
  isProduction: z.boolean().optional(),
});
export type PolicyContext = z.infer<typeof PolicyContextSchema>;
