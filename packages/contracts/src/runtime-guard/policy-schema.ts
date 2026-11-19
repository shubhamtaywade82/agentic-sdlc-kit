// packages/contracts/src/runtime-guard/policy-schema.ts
//
// Versioned policy configuration (M10 — M10-03).
//
// A policy pack is a versioned collection of rules. Each rule maps an
// action category to a verdict, optionally gated by scope thresholds
// (e.g., "allow file.delete if scopeFileCount <= 5, else require-approval").

import { z } from 'zod';
import { ActionCategorySchema, ActionImpactSchema } from './action-classification.js';
// Reuse the M1 VerdictSchema so consumers see a single verdict type across
// the policy/policy.ts (M1 baseline) and runtime-guard/policy-schema.ts
// (M10 versioned policy pack) surfaces. We import the value (zod schema)
// and re-export it for ergonomic single-source imports.
import { VerdictSchema } from '../policy/policy.js';
export { VerdictSchema } from '../policy/policy.js';

export const POLICY_SCHEMA_VERSION = 1 as const;

export const PolicyRuleSchema = z.object({
  id: z.string(),
  // The category this rule applies to. Use "*" to match all categories.
  category: z.union([ActionCategorySchema, z.literal('*')]),
  // The impact this rule applies to. Use "*" to match all impacts.
  impact: z.union([ActionImpactSchema, z.literal('*')]),
  verdict: VerdictSchema,
  // Optional scope threshold: if set, the rule only applies when
  // scope.fileCount (or another scope field) exceeds the threshold.
  threshold: z
    .object({
      field: z.enum(['fileCount']),
      op: z.enum(['gt', 'gte', 'lt', 'lte']),
      value: z.number().int().nonnegative(),
    })
    .optional(),
  // Human-readable reason included in the audit event.
  reason: z.string().min(1),
});

export const PolicyPackSchema = z.object({
  schemaVersion: z.literal(POLICY_SCHEMA_VERSION),
  id: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver'),
  name: z.string().min(1),
  description: z.string().min(1),
  rules: z.array(PolicyRuleSchema),
  // Default verdict for actions not matched by any rule.
  defaultVerdict: VerdictSchema.default('require-approval'),
  // Whether this policy applies in non-interactive mode. If false, all
  // rules are ignored in CI/daemon contexts and the defaultVerdict is
  // used (typically "deny" for fail-closed behavior).
  appliesNonInteractive: z.boolean().default(false),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type PolicyPack = z.infer<typeof PolicyPackSchema>;
