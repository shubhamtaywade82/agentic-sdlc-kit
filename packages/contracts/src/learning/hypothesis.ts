// packages/contracts/src/learning/hypothesis.ts
//
// M31/M32 Improvement Hypothesis & Evolution Lab contracts.

import { z } from "zod";

export const ImprovementHypothesisSchema = z.object({
  id: z.string().min(1),
  targetSkill: z.string().min(1),
  problemObserved: z.string().min(1),
  proposedChange: z.string().min(1),
  expectedBenefit: z.string().min(1),
  riskLevel: z.enum(["low", "medium", "high"]),
  benchmarkTasks: z.array(z.string()).min(1),
});

export type ImprovementHypothesis = z.infer<typeof ImprovementHypothesisSchema>;

export const ExperimentReportSchema = z.object({
  hypothesisId: z.string().min(1),
  baselinePassRate: z.number().min(0).max(1),
  candidatePassRate: z.number().min(0).max(1),
  heldOutGain: z.number(),
  learningCostTokens: z.number().nonnegative(),
  regressions: z.number().int().nonnegative(),
  verdict: z.enum(["promoted", "rejected", "inconclusive"]),
  completedAt: z.string().min(1),
});

export type ExperimentReport = z.infer<typeof ExperimentReportSchema>;
