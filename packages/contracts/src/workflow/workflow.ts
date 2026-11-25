// packages/contracts/src/workflow/workflow.ts
//
// Workflow mode, status, state, and transitions.
//
// The state machine in core.workflows.engine enforces the transition table
// in docs/workflows/WORKFLOWS.md §2. No transition may turn `failed` back
// into `completed` without a new run.
//
// See docs/contracts/CONTRACTS.md §3.

import { z } from 'zod';
import type { RunId, TaskId } from '../common/identifier.js';
import type { CheckStatus } from '../verification/report.js';

export const WorkflowModeSchema = z.enum(['app', 'feature', 'fix', 'refactor']);
export type WorkflowMode = z.infer<typeof WorkflowModeSchema>;

export const WorkflowStatusSchema = z.enum([
  'pending',
  'in_progress',
  'blocked',
  'completed',
  'failed',
]);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const WorkflowTransitionSchema = z.enum(['start', 'block', 'resume', 'complete', 'fail']);
export type WorkflowTransition = z.infer<typeof WorkflowTransitionSchema>;

export const TaskHistoryEntrySchema = z.object({
  taskId: z.string(),
  status: z.enum(['passed', 'failed', 'skipped', 'blocked']),
  evidence: z.array(z.string()).optional(),
});

export const WorkflowStateSchema = z.object({
  runId: z.string(),
  mode: WorkflowModeSchema,
  status: WorkflowStatusSchema,
  startedAt: z.string().optional(),
  currentTaskId: z.string().optional(),
  taskHistory: z.array(TaskHistoryEntrySchema),
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
export type WorkflowRun = WorkflowState;
export type TaskHistoryEntry = z.infer<typeof TaskHistoryEntrySchema>;

// Re-export for ergonomic imports.
export type { RunId, TaskId, CheckStatus };
