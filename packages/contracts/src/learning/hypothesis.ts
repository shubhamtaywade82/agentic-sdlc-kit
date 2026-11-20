// packages/contracts/src/learning/hypothesis.ts
//
// M31/M32 Improvement Hypothesis & Evolution Lab contracts.

import { z } from 'zod';

export const SkillImprovementHypothesisSchema = z.object({
  id: z.string().min(1),
  targetSkill: z.string().min(1),
  problemObserved: z.string().min(1),
  proposedChange: z.string().min(1),
  expectedBenefit: z.string().min(1),
  riskLevel: z.enum(['low', 'medium', 'high']),
  benchmarkTasks: z.array(z.string()).min(1),
});

export type SkillImprovementHypothesis = z.infer<typeof SkillImprovementHypothesisSchema>;

export const ExperimentReportSchema = z.object({
  hypothesisId: z.string().min(1),
  baselinePassRate: z.number().min(0).max(1),
  candidatePassRate: z.number().min(0).max(1),
  heldOutGain: z.number(),
  learningCostTokens: z.number().nonnegative(),
  regressions: z.number().int().nonnegative(),
  // 'not-run': the benchmark environment was unavailable, so nothing was
  // measured. It must never be reported as a completed experiment
  // (ADR-0018: honest reporting over theater).
  verdict: z.enum(['promoted', 'rejected', 'inconclusive', 'not-run']),
  completedAt: z.string().min(1),
});

export type ExperimentReport = z.infer<typeof ExperimentReportSchema>;
