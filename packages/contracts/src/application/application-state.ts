// packages/contracts/src/application/application-state.ts
//
// Application workflow state (M8 Phase A — M8-01, M8-02).
//
// The /kit:app workflow has a richer lifecycle than the generic feature
// workflow because it covers product discovery, architecture, scaffolding,
// and release — not just implementation. The state machine is defined
// here; the transition table is in application-transitions.ts and is
// enforced by core/workflows/application/transitions.ts.
//
// INVARIANT (ADR-0010): completed and failed are terminal. No transition
// may turn failed back into completed without a new run.
//
// See post-M7 roadmap §2.2 and ADR-0010.

import { z } from 'zod';
import type { RunId, TaskId } from '../common/identifier.js';

export const APPLICATION_STAGE = z.enum([
  'intake', // product brief captured
  'discovery', // problem & user analysis
  'requirements', // PRD + functional + non-functional
  'architecture', // ADRs + component map + data model + API + security
  'planning', // vertical-slice plan
  'scaffolding', // initial project structure
  'implementation', // M5 engine drives incremental slices
  'verification', // M6 engine drives verification
  'review', // independent review
  'release', // release readiness
]);
export type ApplicationStage = z.infer<typeof APPLICATION_STAGE>;

export const APPLICATION_STATUS = z.enum([
  'pending', // workflow created, not started
  'in_progress', // a stage is currently executing
  'blocked', // waiting on approval or unresolved decision
  'completed', // release shipped and verified
  'failed', // a stage failed or verification failed
]);
export type ApplicationStatus = z.infer<typeof APPLICATION_STATUS>;

export const APPLICATION_TRANSITION = z.enum([
  'start', // pending → in_progress
  'advance', // in_progress → in_progress (next stage)
  'block', // in_progress → blocked
  'resume', // blocked → in_progress
  'complete', // in_progress → completed (after release stage)
  'fail', // in_progress|blocked → failed
  'revise', // in_progress → in_progress (revisit prior stage)
]);
export type ApplicationTransition = z.infer<typeof APPLICATION_TRANSITION>;

export const ApplicationStateSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  status: APPLICATION_STATUS,
  stage: APPLICATION_STAGE,
  startedAt: z.string().optional(),
  currentTaskId: z.string().optional(),
  stageHistory: z.array(
    z.object({
      stage: APPLICATION_STAGE,
      enteredAt: z.string(),
      exitedAt: z.string().optional(),
      outcome: z
        .enum(['pending', 'advanced', 'blocked', 'completed', 'failed', 'revised'])
        .optional(),
    }),
  ),
  revisions: z.array(
    z.object({
      fromStage: APPLICATION_STAGE,
      toStage: APPLICATION_STAGE,
      reason: z.string(),
      revisedAt: z.string(),
    }),
  ),
});

export type ApplicationState = z.infer<typeof ApplicationStateSchema>;
export type { RunId, TaskId };
