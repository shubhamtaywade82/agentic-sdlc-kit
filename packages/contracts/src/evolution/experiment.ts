// packages/contracts/src/evolution/experiment.ts
//
// M32 Evolution Lab experiment (RESEARCH.md §7). An isolated candidate
// test against a pinned baseline.

import { z } from 'zod';

export const EXPERIMENT_SCHEMA_VERSION = 1 as const;

export const AutonomyLevelSchema = z.enum(['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']);

export const ExperimentSpecSchema = z.object({
  schemaVersion: z.literal(EXPERIMENT_SCHEMA_VERSION),
  id: z.string(),
  // The hypothesis this experiment tests.
  hypothesisId: z.string(),
  // The baseline kit version (pinned).
  baselineKitVersion: z.string().min(1),
  // The candidate kit version (isolated branch).
  candidateKitVersion: z.string().min(1),
  // The benchmark suite to run.
  benchmarkSuiteId: z.string(),
  benchmarkSuiteVersion: z.string(),
  // The number of repetitions (for variance).
  repetitions: z.number().int().min(1).max(10).default(3),
  // The autonomy level this experiment is authorized for.
  autonomyLevel: AutonomyLevelSchema,
  // Whether to use held-out cases (generalization test).
  useHeldOut: z.boolean().default(true),
  createdAt: z.string(),
});

export type AutonomyLevel = z.infer<typeof AutonomyLevelSchema>;
export type ExperimentSpec = z.infer<typeof ExperimentSpecSchema>;

/**
 * Promotion request (M33). When an experiment's candidate beats the
 * baseline and passes guardrails, the engine opens a promotion request.
 *
 * INVARIANT (RESEARCH.md §8): promotion to production requires human
 * approval (L5). The evolution engine MUST NOT merge its own PRs.
 */
export const PromotionRequestSchema = z.object({
  schemaVersion: z.literal(1),
  experimentId: z.string(),
  hypothesisId: z.string(),
  // The comparison report that justifies promotion.
  comparisonReportId: z.string(),
  // The PR that was opened (url or local path).
  prRef: z.string().min(1),
  // The autonomy level required to approve this promotion.
  requiredAutonomyLevel: AutonomyLevelSchema,
  // Whether human approval has been granted.
  approved: z.boolean().default(false),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
  // Rollback plan: how to undo this promotion if it causes regressions.
  rollbackPlan: z.string().min(1),
});

export type PromotionRequest = z.infer<typeof PromotionRequestSchema>;
