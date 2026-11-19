// packages/core/src/workflows/refactor/transitions.ts
//
// Refactor workflow state machine. Pure functions; no side effects.
//
// Enforces the transition table in
// packages/contracts/src/maintenance/refactor-workflow.ts.
//
// CRITICAL INVARIANT: the incremental-refactor stage cannot be entered
// until characterization tests have been recorded. Without a baseline,
// "preserve observable behavior" is meaningless.

import {
  Errors,
  type Result,
  type RefactorState,
  type RefactorStatus,
  type RefactorStage,
  type RefactorTransition,
  REFACTOR_COMPLETABLE_STAGES,
  REFACTOR_STAGE_ORDER,
  REFACTOR_TARGET_STATUS,
  REFACTOR_TRANSITIONS_BY_STATUS,
  characterizationRequiredBeforeRefactor,
} from '@agentic-sdlc-kit/contracts';

export function canTransition(from: RefactorStatus, transition: RefactorTransition): boolean {
  return REFACTOR_TRANSITIONS_BY_STATUS[from].includes(transition);
}

export function transition(
  state: RefactorState,
  t: RefactorTransition,
  opts: { now?: () => string } = {},
): Result<RefactorState> {
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
  if (t === 'complete' && !REFACTOR_COMPLETABLE_STAGES.includes(state.stage)) {
    return {
      ok: false,
      error: Errors.internal(
        `complete is only allowed from stage(s): ${REFACTOR_COMPLETABLE_STAGES.join(', ')}`,
        { stage: state.stage },
      ),
    };
  }
  let nextStage: RefactorStage = state.stage;
  if (t === 'advance') {
    const idx = REFACTOR_STAGE_ORDER.indexOf(state.stage);
    const next = REFACTOR_STAGE_ORDER[idx + 1];
    if (!next) {
      return {
        ok: false,
        error: Errors.internal(`no stage after ${state.stage}`, { stage: state.stage }),
      };
    }
    // INVARIANT: cannot advance to incremental-refactor without characterization tests.
    if (characterizationRequiredBeforeRefactor(state, next)) {
      return {
        ok: false,
        error: Errors.policyViolation(
          'cannot advance to incremental-refactor without characterization tests',
          { from: state.stage, to: next },
        ),
      };
    }
    nextStage = next;
  }
  const nextStatus: RefactorStatus = REFACTOR_TARGET_STATUS[t];
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

export function createRefactorState(runId: string, refactorId: string): RefactorState {
  return {
    schemaVersion: 1,
    runId,
    refactorId,
    status: 'pending',
    stage: 'contract',
    characterizationTestPaths: [],
    incrementsApplied: [],
  };
}

export function isTerminal(status: RefactorStatus): boolean {
  return status === 'completed' || status === 'failed';
}
