// packages/contracts/src/runtime-guard/action-classification.ts
//
// Action classification contract (M10 — M10-01).
//
// Every destructive or sensitive operation the kit (or its host runtime)
// may perform is classified into one of these categories. The policy
// evaluator consumes the classification to decide allow/deny/require-approval.
//
// This extends the M1 baseline PolicyAction enum (which had 8 entries) with
// a richer classification that carries scope and impact. The M1
// PolicyAction is preserved for back-compat.

import { z } from 'zod';

export const ActionCategorySchema = z.enum([
  // File operations:
  'file.read',
  'file.create',
  'file.modify',
  'file.delete',
  'file.bulk-modify',
  'file.sensitive-modify', // config, env, secrets
  // Database:
  'db.read',
  'db.migrate',
  'db.mutate-dev',
  'db.mutate-production',
  // Git:
  'git.read',
  'git.commit',
  'git.push',
  'git.force-push',
  'git.rebase',
  // Dependency:
  'dependency.add',
  'dependency.remove',
  'dependency.upgrade',
  // Release / deploy:
  'release.tag',
  'release.publish',
  'release.deploy',
  // Network:
  'network.fetch',
  'network.mcp-call',
]);

export const ActionImpactSchema = z.enum([
  'none', // read-only
  'local', // affects only the working copy
  'shared-branch', // affects other contributors
  'production', // affects end users or production data
]);

export const ClassifiedActionSchema = z.object({
  category: ActionCategorySchema,
  impact: ActionImpactSchema,
  // Structured scope: file paths, db names, etc. — never secret values.
  scope: z
    .object({
      fileCount: z.number().int().nonnegative().optional(),
      paths: z.array(z.string()).default([]),
      branch: z.string().optional(),
      environment: z.string().optional(),
    })
    .default({}),
});

export type ActionCategory = z.infer<typeof ActionCategorySchema>;
export type ActionImpact = z.infer<typeof ActionImpactSchema>;
export type ClassifiedAction = z.infer<typeof ClassifiedActionSchema>;

/**
 * Heuristic: is this action destructive?
 * Used by the policy evaluator to decide whether to require approval.
 */
export function isDestructive(action: ClassifiedAction): boolean {
  const destructiveCategories: ReadonlyArray<ActionCategory> = [
    'file.delete',
    'file.bulk-modify',
    'file.sensitive-modify',
    'db.migrate',
    'db.mutate-dev',
    'db.mutate-production',
    'git.force-push',
    'git.rebase',
    'dependency.remove',
    'release.tag',
    'release.publish',
    'release.deploy',
  ];
  return destructiveCategories.includes(action.category);
}

/**
 * Heuristic: is this action production-impacting?
 */
export function isProduction(action: ClassifiedAction): boolean {
  return action.impact === 'production' || action.category === 'db.mutate-production';
}
