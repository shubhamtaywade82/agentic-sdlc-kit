// packages/core/src/workflows/application/transitions.ts
//
// Application workflow state machine. Pure functions; no side effects.
//
// Enforces the transition table in
// packages/contracts/src/application/application-transitions.ts.
//
// INVARIANTS:
//   - completed and failed are terminal.
//   - `complete` is only allowed from the `release` stage.
//   - `revise` can only move to a prior stage (per revisableFrom()).
//   - Revising does not change status (stays in_progress).

import {
  Errors,
  type Result,
  type ApplicationState,
  type ApplicationStatus,
  type ApplicationStage,
  type ApplicationTransition,
} from '@agentic-sdlc-kit/contracts';
import {
  COMPLETABLE_STAGES,
  STAGE_ORDER,
  TARGET_STATUS,
  TRANSITIONS_BY_STATUS,
  revisableFrom,
} from '@agentic-sdlc-kit/contracts';

export function canTransition(from: ApplicationStatus, transition: ApplicationTransition): boolean {
  return TRANSITIONS_BY_STATUS[from].includes(transition);
}

/**
 * Apply a transition. For `advance`, the stage moves to the next in
 * STAGE_ORDER. For `revise`, the caller must specify the target stage in
 * the second argument; it must be in revisableFrom(currentStage).
 *
 * `now` is injectable for deterministic tests.
 */
export function transition(
  state: ApplicationState,
  t: ApplicationTransition,
  opts: { now?: () => string; reviseTo?: ApplicationStage } = {},
): Result<ApplicationState> {
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

  // complete: only allowed from the release stage.
  if (t === 'complete' && !COMPLETABLE_STAGES.includes(state.stage)) {
    return {
      ok: false,
      error: Errors.internal(
        `complete is only allowed from stage(s): ${COMPLETABLE_STAGES.join(', ')}; current stage is ${state.stage}`,
        { stage: state.stage },
      ),
    };
  }

  // revise: target stage must be in revisableFrom(currentStage).
  if (t === 'revise') {
    if (!opts.reviseTo) {
      return {
        ok: false,
        error: Errors.internal('revise requires reviseTo', {}),
      };
    }
    const allowed = revisableFrom(state.stage);
    if (!allowed.includes(opts.reviseTo)) {
      return {
        ok: false,
        error: Errors.internal(
          `cannot revise from ${state.stage} to ${opts.reviseTo}; allowed: ${allowed.join(', ') || '(none)'}`,
          { from: state.stage, to: opts.reviseTo },
        ),
      };
    }
  }

  const nextStatus: ApplicationStatus = TARGET_STATUS[t];
  let nextStage: ApplicationStage = state.stage;
  if (t === 'advance') {
    const idx = STAGE_ORDER.indexOf(state.stage);
    const next = STAGE_ORDER[idx + 1];
    if (!next) {
      return {
        ok: false,
        error: Errors.internal(`no stage after ${state.stage}`, { stage: state.stage }),
      };
    }
    nextStage = next;
  } else if (t === 'revise' && opts.reviseTo) {
    nextStage = opts.reviseTo;
  }

  // Update stage history: close the current entry, open the next.
  const stageHistory = state.stageHistory.map((h, i, arr) => {
    if (i === arr.length - 1 && h.exitedAt === undefined) {
      return {
        ...h,
        exitedAt: now(),
        outcome: t as ApplicationState['stageHistory'][number]['outcome'],
      };
    }
    return h;
  });
  stageHistory.push({
    stage: nextStage,
    enteredAt: now(),
  });

  const revisions =
    t === 'revise'
      ? [
          ...state.revisions,
          {
            fromStage: state.stage,
            toStage: nextStage,
            reason: `revise at ${now()}`,
            revisedAt: now(),
          },
        ]
      : state.revisions;

  const nextState: ApplicationState = {
    ...state,
    status: nextStatus,
    stage: nextStage,
    startedAt: state.startedAt ?? (t === 'start' ? now() : undefined),
    stageHistory,
    revisions,
  };
  return { ok: true, value: nextState };
}

/**
 * Factory for a fresh application workflow state at the intake stage.
 */
export function createApplicationState(
  runId: string,
  now: () => string = () => new Date().toISOString(),
): ApplicationState {
  return {
    schemaVersion: 1,
    runId,
    status: 'pending',
    stage: 'intake',
    stageHistory: [{ stage: 'intake', enteredAt: now() }],
    revisions: [],
  };
}

export function isTerminal(status: ApplicationStatus): boolean {
  return status === 'completed' || status === 'failed';
}
