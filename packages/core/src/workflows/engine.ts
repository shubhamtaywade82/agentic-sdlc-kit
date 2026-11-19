// packages/core/src/workflows/engine.ts
//
// Workflow state machine. Pure functions; no side effects.
//
// Allowed transitions (WORKFLOWS.md §2):
//   pending      --start-->    in_progress
//   in_progress  --block-->    blocked
//   blocked      --resume-->   in_progress
//   in_progress  --complete--> completed
//   in_progress  --fail-->     failed
//   blocked      --fail-->     failed
//
// completed and failed are terminal.
//
// INVARIANT: no transition may turn `failed` back into `completed` (or any
// non-terminal status) without a new run.

import {
  Errors,
  type Result,
  type WorkflowMode,
  type WorkflowState,
  type WorkflowStatus,
  type WorkflowTransition,
} from "@agentic-sdlc-kit/contracts";

const TRANSITIONS: Readonly<Record<WorkflowStatus, ReadonlyArray<WorkflowTransition>>> = {
  pending: ["start"],
  in_progress: ["block", "complete", "fail"],
  blocked: ["resume", "fail"],
  completed: [],
  failed: [],
};

const TARGET_OF: Readonly<Record<WorkflowTransition, WorkflowStatus>> = {
  start: "in_progress",
  block: "blocked",
  resume: "in_progress",
  complete: "completed",
  fail: "failed",
};

export function canTransition(from: WorkflowStatus, transition: WorkflowTransition): boolean {
  const allowed = TRANSITIONS[from];
  return allowed !== undefined && allowed.includes(transition);
}

/**
 * Apply a transition to a workflow state. Returns Result with the next
 * state, or a CONTRACT_INVALID-flavored Err if the transition is not
 * allowed.
 *
 * `now` is injectable for deterministic tests. Production callers should
 * pass `() => new Date().toISOString()`. The default is real wall-clock
 * time; tests pass a fixed clock.
 */
export function transition(
  state: WorkflowState,
  t: WorkflowTransition,
  now: () => string = () => new Date().toISOString(),
): Result<WorkflowState> {
  if (!canTransition(state.status, t)) {
    return {
      ok: false,
      error: Errors.internal(`invalid transition ${t} from ${state.status}`, {
        from: state.status,
        transition: t,
      }),
    };
  }
  const next = TARGET_OF[t];
  if (next === undefined) {
    // Unreachable: TARGET_OF is exhaustive over WorkflowTransition, but
    // noUncheckedIndexedAccess requires the guard.
    return {
      ok: false,
      error: Errors.internal(`no target for transition ${t}`),
    };
  }
  const startedAt =
    t === "start"
      ? now()
      : state.startedAt;
  const next_state: WorkflowState = { ...state, status: next, startedAt };
  return { ok: true, value: next_state };
}

/**
 * Factory for a fresh workflow state. Caller provides the runId and mode;
 * status starts at `pending`.
 */
export function createWorkflowState(runId: string, mode: WorkflowMode): WorkflowState {
  return {
    runId,
    mode,
    status: "pending",
    taskHistory: [],
  };
}

/**
 * Predicate: is the given status terminal?
 */
export function isTerminal(status: WorkflowStatus): boolean {
  return status === "completed" || status === "failed";
}
