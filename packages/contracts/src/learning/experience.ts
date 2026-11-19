// packages/contracts/src/learning/experience.ts
//
// M27/M28 Experience contracts: structured telemetry from workflow executions,
// verification reports, and human corrections for continuous learning.

import { z } from "zod";

export const ExperiencePhaseSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["passed", "failed"]),
  durationMs: z.number().nonnegative(),
});

export const ExperienceRecordSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  featureId: z.string().min(1),
  stack: z.string().min(1),
  outcome: z.enum(["success", "failure", "partial"]),
  phases: z.array(ExperiencePhaseSchema),
  failureSummary: z.string().optional(),
  humanCorrection: z.string().optional(),
  timestamp: z.string().min(1),
});

export type ExperiencePhase = z.infer<typeof ExperiencePhaseSchema>;
export type ExperienceRecord = z.infer<typeof ExperienceRecordSchema>;
