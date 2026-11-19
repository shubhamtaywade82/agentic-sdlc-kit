// packages/contracts/src/maintenance/bug-fix-workflow.ts
//
// Bug-fix workflow state and transitions (M9 — M9-03 through M9-10).
//
// Lifecycle (post-M7 roadmap §3.1):
//   Bug Report → Discovery → Reproduction → Root Cause →
//   Regression Test → Minimal Fix → Focused Verification →
//   Regression Verification → Review → Completion Report
//
// CRITICAL RULES (post-M7 roadmap §3.1):
//   - Do not fix a symptom without investigating the root cause.
//   - Do not delete or weaken a failing test to make the build green.
//   - Do not claim reproduction when only a theoretical explanation exists.
//   - A non-reproducible issue must be reported as such.
//   - Changes must remain within the approved scope unless expanded.

import { z } from 'zod';

export const BUG_FIX_STAGE = z.enum([
  'report', // bug report captured
  'discovery', // affected-code discovery
  'reproduction', // reproduce the defect
  'root-cause', // root cause analysis
  'regression-test', // write a failing regression test
  'minimal-fix', // implement the smallest valid correction
  'focused-verify', // focused test evidence
  'regression-verify', // broader regression evidence
  'review', // independent review
  'completion', // completion report
]);
export type BugFixStage = z.infer<typeof BUG_FIX_STAGE>;

export const BUG_FIX_STATUS = z.enum(['pending', 'in_progress', 'blocked', 'completed', 'failed']);
export type BugFixStatus = z.infer<typeof BUG_FIX_STATUS>;

export const BUG_FIX_TRANSITION = z.enum([
  'start',
  'advance',
  'block',
  'resume',
  'complete',
  'fail',
]);
export type BugFixTransition = z.infer<typeof BUG_FIX_TRANSITION>;

export const BugFixStateSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  bugId: z.string(),
  status: BUG_FIX_STATUS,
  stage: BUG_FIX_STAGE,
  startedAt: z.string().optional(),
  // Filled in during root-cause:
  rootCauseSummary: z.string().optional(),
  // Filled in during regression-test:
  regressionTestPath: z.string().optional(),
  // Filled in during focused-verify / regression-verify:
  verificationReportIds: z.array(z.string()).default([]),
  // Files the fix touched (for review).
  affectedFiles: z.array(z.string()).default([]),
});

export type BugFixState = z.infer<typeof BugFixStateSchema>;

export const BUG_FIX_STAGE_ORDER: ReadonlyArray<BugFixStage> = [
  'report',
  'discovery',
  'reproduction',
  'root-cause',
  'regression-test',
  'minimal-fix',
  'focused-verify',
  'regression-verify',
  'review',
  'completion',
];

export const BUG_FIX_TRANSITIONS_BY_STATUS: Readonly<
  Record<BugFixStatus, ReadonlyArray<BugFixTransition>>
> = {
  pending: ['start'],
  in_progress: ['advance', 'block', 'complete', 'fail'],
  blocked: ['resume', 'fail'],
  completed: [],
  failed: [],
};

export const BUG_FIX_TARGET_STATUS: Readonly<Record<BugFixTransition, BugFixStatus>> = {
  start: 'in_progress',
  advance: 'in_progress',
  block: 'blocked',
  resume: 'in_progress',
  complete: 'completed',
  fail: 'failed',
};

/**
 * The completion stage is the only stage from which `complete` is allowed.
 */
export const BUG_FIX_COMPLETABLE_STAGES: ReadonlyArray<BugFixStage> = ['completion'];

/**
 * INVARIANT: the regression-test stage MUST be completed before the
 * minimal-fix stage can advance. This is the most important invariant in
 * the bug-fix workflow — without a regression test, there is no proof the
 * fix actually fixes anything.
 */
export function regressionTestRequiredBeforeFix(
  fromStage: BugFixStage,
  toStage: BugFixStage,
): boolean {
  if (toStage === 'minimal-fix') {
    // The stage before minimal-fix in canonical order is regression-test.
    const fixIdx = BUG_FIX_STAGE_ORDER.indexOf('minimal-fix');
    const prevStage = BUG_FIX_STAGE_ORDER[fixIdx - 1];
    return prevStage === 'regression-test' && fromStage !== 'regression-test';
  }
  return false;
}
