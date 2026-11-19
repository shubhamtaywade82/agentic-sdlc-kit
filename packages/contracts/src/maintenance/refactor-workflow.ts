// packages/contracts/src/maintenance/refactor-workflow.ts
//
// Refactor workflow state and transitions (M9 — M9-13 through M9-20).
//
// Lifecycle (post-M7 roadmap §3.2):
//   Contract → Discover Deps → Characterization Tests → Target Structure →
//   Identify Patterns → Incremental Refactor → Public-Contract Validation →
//   Regression Testing → Quality Comparison → Review
//
// INVARIANT (post-M7 roadmap §3.2): characterization tests MUST exist
// before structural changes. The workflow enforces this: the
// `incremental-refactor` stage cannot be entered from a stage other than
// `characterization-tests` (or `target-structure` if characterization
// tests have already been recorded).

import { z } from 'zod';

export const REFACTOR_STAGE = z.enum([
  'contract',
  'discover-deps',
  'characterization-tests',
  'target-structure',
  'identify-patterns',
  'incremental-refactor',
  'contract-validation',
  'regression-testing',
  'quality-comparison',
  'review',
]);
export type RefactorStage = z.infer<typeof REFACTOR_STAGE>;

export const REFACTOR_STATUS = z.enum(['pending', 'in_progress', 'blocked', 'completed', 'failed']);
export type RefactorStatus = z.infer<typeof REFACTOR_STATUS>;

export const REFACTOR_TRANSITION = z.enum([
  'start',
  'advance',
  'block',
  'resume',
  'complete',
  'fail',
]);
export type RefactorTransition = z.infer<typeof REFACTOR_TRANSITION>;

export const RefactorStateSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  refactorId: z.string(),
  status: REFACTOR_STATUS,
  stage: REFACTOR_STAGE,
  startedAt: z.string().optional(),
  // Filled in during discover-deps:
  dependencyMapPath: z.string().optional(),
  // Filled in during characterization-tests:
  characterizationTestPaths: z.array(z.string()).default([]),
  // Filled in during incremental-refactor:
  incrementsApplied: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string(),
        affectedFiles: z.array(z.string()),
        regressionPassed: z.boolean(),
      }),
    )
    .default([]),
  // Filled in during quality-comparison:
  beforeAfterReportPath: z.string().optional(),
});

export type RefactorState = z.infer<typeof RefactorStateSchema>;

export const REFACTOR_STAGE_ORDER: ReadonlyArray<RefactorStage> = [
  'contract',
  'discover-deps',
  'characterization-tests',
  'target-structure',
  'identify-patterns',
  'incremental-refactor',
  'contract-validation',
  'regression-testing',
  'quality-comparison',
  'review',
];

export const REFACTOR_TRANSITIONS_BY_STATUS: Readonly<
  Record<RefactorStatus, ReadonlyArray<RefactorTransition>>
> = {
  pending: ['start'],
  in_progress: ['advance', 'block', 'complete', 'fail'],
  blocked: ['resume', 'fail'],
  completed: [],
  failed: [],
};

export const REFACTOR_TARGET_STATUS: Readonly<Record<RefactorTransition, RefactorStatus>> = {
  start: 'in_progress',
  advance: 'in_progress',
  block: 'blocked',
  resume: 'in_progress',
  complete: 'completed',
  fail: 'failed',
};

export const REFACTOR_COMPLETABLE_STAGES: ReadonlyArray<RefactorStage> = ['review'];

/**
 * INVARIANT: the incremental-refactor stage cannot be entered until
 * characterization tests have been recorded. This is the most important
 * invariant in the refactor workflow — without a baseline, "preserve
 * observable behavior" is meaningless.
 */
export function characterizationRequiredBeforeRefactor(
  state: RefactorState,
  toStage: RefactorStage,
): boolean {
  if (toStage === 'incremental-refactor') {
    return state.characterizationTestPaths.length === 0;
  }
  return false;
}
