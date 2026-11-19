// packages/contracts/src/routing/escalation.ts
//
// M12 escalation policy (M12-10). When verification fails, the router
// decides whether to retry with a stronger model/effort or escalate to
// human review.

import { z } from 'zod';
import { EffortSchema } from './routing-request.js';

export const EscalationRuleSchema = z.object({
  id: z.string(),
  // The failure outcome that triggers this rule.
  trigger: z.enum(['failed-verification', 'failed-review']),
  // The maximum number of retries before escalating to human review.
  maxRetries: z.number().int().min(0).max(5),
  // The effort to use on retry (typically higher than the original).
  retryEffort: EffortSchema,
  // Whether to switch to a stronger model on retry.
  switchToStrongerModel: z.boolean().default(false),
  // After maxRetries, escalate to human review.
  escalateToHuman: z.boolean().default(true),
});

export type EscalationRule = z.infer<typeof EscalationRuleSchema>;
