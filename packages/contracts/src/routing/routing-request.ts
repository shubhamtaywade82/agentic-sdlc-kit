// packages/contracts/src/routing/routing-request.ts
//
// M12 routing request contract (M12-01). The model-router Mod consumes
// this to decide model + effort for a turn or subagent.
//
// Per RESEARCH.md §C and post-M7 §6: complexity and risk are separate
// dimensions. The router must not equate a simple task with a safe task.

import { z } from 'zod';

export const ComplexitySchema = z.enum(['low', 'medium', 'high']);
// Named RoutingRiskSchema to avoid collision with specification.ts
// RiskSchema (3-level "low|medium|high" for spec risk severity). Routing
// risk is 4-level because production database deletion is "critical".
export const RoutingRiskSchema = z.enum(['low', 'medium', 'high', 'critical']);
export const EffortSchema = z.enum(['low', 'medium', 'high']);

export const RoutingContextSchema = z.object({
  // Whether this is a main-turn request or a subagent spawn.
  scope: z.enum(['main-turn', 'subagent']),
  // The task type, classified by the classifier module.
  taskType: z.string().min(1),
  complexity: ComplexitySchema,
  risk: RoutingRiskSchema,
  // The size of the context being routed (rough token estimate).
  contextTokens: z.number().int().nonnegative().optional(),
  // Required capabilities (e.g., ["code-edit", "tool-use"]).
  requiredCapabilities: z.array(z.string()).default([]),
  // If the user explicitly selected a model, the router MUST preserve it.
  explicitUserModel: z.string().optional(),
  explicitUserEffort: EffortSchema.optional(),
  // Previous execution outcome (for verification-driven escalation).
  previousOutcome: z
    .enum(['none', 'passed', 'failed-verification', 'failed-review'])
    .default('none'),
});

export const RoutingDecisionSchema = z.object({
  model: z.string().min(1),
  effort: EffortSchema,
  // The reason this decision was made (for explainability).
  reason: z.string().min(1),
  // Whether this decision was a fallback (provider/model unavailable).
  isFallback: z.boolean().default(false),
  // Whether this decision was an escalation (previous attempt failed).
  isEscalation: z.boolean().default(false),
  // The matched rule id (if a static policy matched).
  matchedRuleId: z.string().optional(),
});

export type Complexity = z.infer<typeof ComplexitySchema>;
export type RoutingRisk = z.infer<typeof RoutingRiskSchema>;
export type Effort = z.infer<typeof EffortSchema>;
export type RoutingContext = z.infer<typeof RoutingContextSchema>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
