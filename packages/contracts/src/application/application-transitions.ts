// packages/contracts/src/application/application-transitions.ts
//
// Application workflow transition table (M8 Phase A — M8-02).
//
// Allowed transitions and their target stage. This is the *contract*; the
// pure-function enforcement lives in core/workflows/application/transitions.ts.
//
// See post-M7 roadmap §2.2 and ADR-0010.

import type {
  ApplicationStage,
  ApplicationStatus,
  ApplicationTransition,
} from './application-state.js';

/**
 * Stages in canonical order. `advance` moves to the next stage in this
 * list. `revise` may move to any prior stage.
 */
export const STAGE_ORDER: ReadonlyArray<ApplicationStage> = [
  'intake',
  'discovery',
  'requirements',
  'architecture',
  'planning',
  'scaffolding',
  'implementation',
  'verification',
  'review',
  'release',
];

/**
 * Per-status allowed transitions.
 */
export const TRANSITIONS_BY_STATUS: Readonly<
  Record<ApplicationStatus, ReadonlyArray<ApplicationTransition>>
> = {
  pending: ['start'],
  in_progress: ['advance', 'block', 'complete', 'fail', 'revise'],
  blocked: ['resume', 'fail'],
  completed: [],
  failed: [],
};

/**
 * The target status for a transition (independent of stage).
 */
export const TARGET_STATUS: Readonly<Record<ApplicationTransition, ApplicationStatus>> = {
  start: 'in_progress',
  advance: 'in_progress',
  block: 'blocked',
  resume: 'in_progress',
  complete: 'completed',
  fail: 'failed',
  revise: 'in_progress',
};

/**
 * The release stage is the only stage from which `complete` is allowed.
 */
export const COMPLETABLE_STAGES: ReadonlyArray<ApplicationStage> = ['release'];

/**
 * Stages reachable via `revise` from a given stage = all earlier stages.
 */
export function revisableFrom(stage: ApplicationStage): ReadonlyArray<ApplicationStage> {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx <= 0) return [];
  return STAGE_ORDER.slice(0, idx);
}
