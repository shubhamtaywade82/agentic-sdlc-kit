// packages/core/src/workflows/bug-fix/transitions.ts
//
// Bug-fix workflow state machine. Pure functions; no side effects.
//
// Enforces the transition table in
// packages/contracts/src/maintenance/bug-fix-workflow.ts.
//
// CRITICAL INVARIANT: the regression-test stage MUST be completed before
// the minimal-fix stage can be entered. This is the most important
// invariant in the bug-fix workflow — without a regression test, there is
// no proof the fix actually fixes anything.

import {
  Errors,
  type Result,
  type BugFixState,
  type BugFixStatus,
  type BugFixStage,
  type BugFixTransition,
  BUG_FIX_COMPLETABLE_STAGES,
  BUG_FIX_STAGE_ORDER,
  BUG_FIX_TARGET_STATUS,
  BUG_FIX_TRANSITIONS_BY_STATUS,
  regressionTestRequiredBeforeFix,
} from '@agentic-sdlc-kit/contracts';

export function canTransition(from: BugFixStatus, transition: BugFixTransition): boolean {
  return BUG_FIX_TRANSITIONS_BY_STATUS[from].includes(transition);
}

export function transition(
  state: BugFixState,
  t: BugFixTransition,
  opts: { now?: () => string } = {},
): Result<BugFixState> {
  const now = opts.now ?? (() => new Date().toISOString());
  if (!canTransition(state.status, t)) {
    return {
      ok: false,
      error: Errors.internal(`invalid transition ${t} from status ${state.status}`, {
        from: state.status,
        transition: t,
      }),
    };
  }
  // complete: only from the completion stage.
  if (t === 'complete' && !BUG_FIX_COMPLETABLE_STAGES.includes(state.stage)) {
    return {
      ok: false,
      error: Errors.internal(
        `complete is only allowed from stage(s): ${BUG_FIX_COMPLETABLE_STAGES.join(', ')}`,
        { stage: state.stage },
      ),
    };
  }
  // advance: must follow canonical stage order.
  let nextStage: BugFixStage = state.stage;
  if (t === 'advance') {
    const idx = BUG_FIX_STAGE_ORDER.indexOf(state.stage);
    const next = BUG_FIX_STAGE_ORDER[idx + 1];
    if (!next) {
      return {
        ok: false,
        error: Errors.internal(`no stage after ${state.stage}`, { stage: state.stage }),
      };
    }
    // INVARIANT: cannot advance to minimal-fix from a non-regression-test stage.
    if (regressionTestRequiredBeforeFix(state.stage, next)) {
      return {
        ok: false,
        error: Errors.policyViolation(
          'cannot advance to minimal-fix without first completing regression-test',
          { from: state.stage, to: next },
        ),
      };
    }
    nextStage = next;
  }
  const nextStatus: BugFixStatus = BUG_FIX_TARGET_STATUS[t];
  return {
    ok: true,
    value: {
      ...state,
      status: nextStatus,
      stage: nextStage,
      startedAt: state.startedAt ?? (t === 'start' ? now() : undefined),
    },
  };
}

export function createBugFixState(runId: string, bugId: string): BugFixState {
  return {
    schemaVersion: 1,
    runId,
    bugId,
    status: 'pending',
    stage: 'report',
    verificationReportIds: [],
    affectedFiles: [],
  };
}

export function isTerminal(status: BugFixStatus): boolean {
  return status === 'completed' || status === 'failed';
}
