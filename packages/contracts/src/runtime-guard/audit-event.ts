// packages/contracts/src/runtime-guard/audit-event.ts
//
// Audit event contract (M10 — M10-07).
//
// Every policy decision produces an audit event. Audit events are
// persisted under .ai-kit/reports/audit/ and never contain secret values.

import { z } from 'zod';
import { ActionCategorySchema, ActionImpactSchema } from './action-classification.js';
import { VerdictSchema } from './policy-schema.js';

export const AUDIT_EVENT_SCHEMA_VERSION = 1 as const;

export const AuditEventSchema = z.object({
  schemaVersion: z.literal(AUDIT_EVENT_SCHEMA_VERSION),
  id: z.string(),
  at: z.string(), // ISO 8601
  runId: z.string().optional(),
  // The action that was evaluated.
  action: z.object({
    category: ActionCategorySchema,
    impact: ActionImpactSchema,
    scopeSummary: z.string(), // human-readable; never raw secret values
  }),
  // The verdict the evaluator returned.
  verdict: VerdictSchema,
  // The rule that matched (if any).
  matchedRuleId: z.string().optional(),
  // Whether an approval was granted (if verdict was require-approval).
  approval: z
    .object({
      approver: z.string(),
      grantedAt: z.string(),
      rationale: z.string(),
    })
    .optional(),
  // Whether the action was a bypass (explicit user override).
  bypass: z
    .object({
      flag: z.string(),
      setUser: z.string(),
      scope: z.string(),
    })
    .optional(),
  // The outcome: did the action actually execute?
  outcome: z.enum(['executed', 'denied', 'deferred', 'interrupted']),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;
