// packages/contracts/src/planning/task.ts
//
// Task and implementation plan contracts. Declared in M0; produced by the
// implementation-planning skill in M4 and validated by kit validate-plan.
//
// See docs/contracts/CONTRACTS.md §5.

import { z } from "zod";

export const TaskScopeSchema = z.enum(["xs", "s", "m", "l", "xl"]);
export const RiskLevelSchema = z.enum(["low", "medium", "high"]);

export const TaskVerificationSchema = z.object({
  command: z.array(z.string().min(1)).min(1, "verification command must be a non-empty array"),
  expectedStatus: z.enum(["passed", "failed", "skipped", "blocked"]),
});

export const TaskSchema = z.object({
  id: z.string().regex(/^[A-Z]+-[0-9]{3,}$/, "id must match TASK-NNN"),
  description: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  verification: TaskVerificationSchema,
  dependencies: z.array(z.string()),
  likelyFiles: z.array(z.string()),
  estimatedScope: TaskScopeSchema,
  risk: RiskLevelSchema,
});

export const DependencyEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  reason: z.string().min(1),
});

export const ImplementationPlanSchema = z.object({
  featureId: z.string().regex(/^[A-Z]+-[0-9]{3,}$/, "featureId must match FEATURE-NNN"),
  tasks: z.array(TaskSchema),
  edges: z.array(DependencyEdgeSchema),
  verticalSlices: z.array(z.array(z.string())),
});

export type Task = z.infer<typeof TaskSchema>;
export type TaskVerification = z.infer<typeof TaskVerificationSchema>;
export type DependencyEdge = z.infer<typeof DependencyEdgeSchema>;
export type ImplementationPlan = z.infer<typeof ImplementationPlanSchema>;
export type TaskScope = z.infer<typeof TaskScopeSchema>;
export type RiskLevel = z.infer<typeof RiskLevelSchema>;
