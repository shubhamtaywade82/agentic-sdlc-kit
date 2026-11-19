// packages/contracts/src/routing/routing-policy.ts
//
// M12 routing policy (M12-03). A static, deterministic policy that maps
// (taskType, complexity, risk) → (model, effort, verification).

import { z } from 'zod';
import { ComplexitySchema, RoutingRiskSchema, EffortSchema } from './routing-request.js';

export const ROUTING_POLICY_SCHEMA_VERSION = 1 as const;

export const RoutingRuleSchema = z.object({
  id: z.string(),
  // Matchers; "*" matches any.
  taskType: z.union([z.string(), z.literal('*')]),
  complexity: z.union([ComplexitySchema, z.literal('*')]),
  risk: z.union([RoutingRiskSchema, z.literal('*')]),
  // The model to select (or "auto" to let the registry pick by capability).
  model: z.string().min(1),
  effort: EffortSchema,
  // Required verification for this class of task.
  verification: z.enum(['none', 'structural', 'tests', 'independent-review', 'mandatory-security']),
  reason: z.string().min(1),
});

export const RoutingPolicySchema = z.object({
  schemaVersion: z.literal(ROUTING_POLICY_SCHEMA_VERSION),
  id: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver'),
  rules: z.array(RoutingRuleSchema),
  // Default model when no rule matches.
  defaultModel: z.string().min(1),
  defaultEffort: EffortSchema,
  // Whether the router starts in suggest-only mode (per post-M7 §6).
  suggestOnly: z.boolean().default(true),
});

export type RoutingRule = z.infer<typeof RoutingRuleSchema>;
export type RoutingPolicy = z.infer<typeof RoutingPolicySchema>;
