// packages/core/src/recovery/policy.ts
//
// Recovery policy for rejected TDD attempts (item 1, Option A).
//
// When the evidence gate rejects an attempt, the kit decides whether the
// agent may try again with feedback. Retries stay bounded by the human: the
// policy only shapes the next attempt's instructions. It never advances a
// phase, and the gate remains the sole authority over transitions.
//
// Three rules:
//   - Feedback only where the agent can fix the cause within its own scope.
//     Dependency, environment, timeout and unclassified failures stop, because
//     no edit by the agent resolves them.
//   - Feedback text is this module's fixed guidance, never stored or captured
//     output. Test output is untrusted, and passing it into prompts would open
//     a prompt-injection path.
//   - The attempt limit bounds automatic feedback. It does not stop a human
//     from starting another run.

import type { RecoveryHint } from '@agentic-sdlc-kit/contracts';
import type { TddPhase, TddStepRecord } from '../tdd/cycle.js';
import type { FailureClassification } from '../verification/classification.js';

export const MAX_RECOVERY_ATTEMPTS = 3;

/** `none`: the phase advanced, so there is nothing to recover. */
export type RecoveryAction = 'feedback' | 'stop' | 'none';

type ActivePhase = Exclude<TddPhase, 'completed'>;
type ActionTable = Record<FailureClassification, RecoveryAction>;

// Red: the targeted test must fail for the right reason. A red assertion is the
// only classification that advances the phase.
const RED_ACTIONS: ActionTable = {
  assertion: 'none',
  compilation: 'feedback',
  discovery: 'feedback',
  dependency: 'stop',
  environment: 'stop',
  timeout: 'stop',
  unclassified: 'stop',
};

// Green and refactor: the targeted test must pass.
const GREEN_ACTIONS: ActionTable = {
  assertion: 'feedback',
  compilation: 'feedback',
  discovery: 'stop',
  dependency: 'stop',
  environment: 'stop',
  timeout: 'stop',
  unclassified: 'stop',
};

const ACTIONS: Record<ActivePhase, ActionTable> = {
  red: RED_ACTIONS,
  green: GREEN_ACTIONS,
  refactor: GREEN_ACTIONS,
};

// Fixed guidance for the agent (feedback) or the human (stop). Every
// classification is covered per phase, so a new classification fails to compile
// until it has guidance.
const STOP_GUIDANCE: Pick<
  Record<FailureClassification, string>,
  'dependency' | 'environment' | 'timeout' | 'unclassified'
> = {
  dependency:
    'A declared dependency could not be resolved or loaded. Install or repair it outside this task; the agent must not add dependencies.',
  environment: 'The verification command could not start. Check the environment, then run the phase again.',
  timeout:
    'The verification command exceeded its timeout. Investigate the slow command; the agent must not extend the timeout.',
  unclassified: 'The failure did not match a known failure mode. Inspect the output, then run the phase again.',
};

const RED_GUIDANCE: Record<FailureClassification, string> = {
  assertion: 'The targeted test already fails at an assertion, so this attempt advances the phase.',
  compilation:
    'The targeted test or the code it imports does not compile. Fix the compile error and keep the assertion about the missing behavior.',
  discovery:
    "The targeted test was not found. Check the test file name and location against the task's verification command.",
  ...STOP_GUIDANCE,
};

const GREEN_GUIDANCE: Record<FailureClassification, string> = {
  assertion:
    'The targeted test still fails. Implement the missing behavior; do not change the test to make it pass.',
  compilation: 'The implementation does not compile. Fix the compile error without changing the test.',
  discovery: 'The targeted test was not found after implementation. Check the test file name and location.',
  ...STOP_GUIDANCE,
};

const GUIDANCE: Record<ActivePhase, Record<FailureClassification, string>> = {
  red: RED_GUIDANCE,
  green: GREEN_GUIDANCE,
  refactor: GREEN_GUIDANCE,
};

export function recoveryActionFor(phase: ActivePhase, classification: FailureClassification): RecoveryAction {
  return ACTIONS[phase][classification];
}

export interface RecoveryTaskState {
  readonly phase: TddPhase;
  readonly records: readonly TddStepRecord[];
}

export interface RecoveryAssessment {
  readonly hint: RecoveryHint | null;
  /** Why no feedback is offered, for a human. Null when feedback is offered or nothing failed. */
  readonly stopReason: string | null;
  /** True when feedback was withdrawn because the attempt limit was reached. */
  readonly exhausted: boolean;
}

const NOTHING: RecoveryAssessment = { hint: null, stopReason: null, exhausted: false };

/** Failed attempts in the current phase since it began, oldest first. */
function trailingFailures(records: readonly TddStepRecord[], phase: TddPhase): TddStepRecord[] {
  const failures: TddStepRecord[] = [];
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (record === undefined || record.phase !== phase || record.status !== 'failed') break;
    failures.unshift(record);
  }
  return failures;
}

export function assessRecovery(task: RecoveryTaskState): RecoveryAssessment {
  if (task.phase === 'completed') return NOTHING;
  const failures = trailingFailures(task.records, task.phase);
  const latest = failures[failures.length - 1];
  if (latest === undefined) return NOTHING;

  // A failed attempt with no verification comes from a pre-v2 record. Treat it as
  // unclassified, which never feeds back.
  const classification = latest.verification?.classification ?? 'unclassified';
  const phase = task.phase;
  const action = recoveryActionFor(phase, classification);
  if (action === 'none') return NOTHING;
  if (action === 'stop') {
    return { hint: null, stopReason: `Blocked: ${GUIDANCE[phase][classification]}`, exhausted: false };
  }
  if (failures.length >= MAX_RECOVERY_ATTEMPTS) {
    return {
      hint: null,
      stopReason: `${phase} attempts exhausted (${MAX_RECOVERY_ATTEMPTS}, last failure: ${classification}): human review needed`,
      exhausted: true,
    };
  }
  return {
    hint: {
      classification,
      action: 'feedback',
      reason: GUIDANCE[phase][classification],
      attempt: failures.length,
      maxAttempts: MAX_RECOVERY_ATTEMPTS,
    },
    stopReason: null,
    exhausted: false,
  };
}

/** The sentence added to the next attempt's instructions. Built only from the hint's fixed fields. */
export function formatRecoveryInstruction(hint: RecoveryHint): string {
  return (
    `Previous attempt ${hint.attempt} of ${hint.maxAttempts} was rejected by the evidence gate ` +
    `(classification: ${hint.classification}). ${hint.reason} ` +
    'Do not alter the verification command or weaken the test.'
  );
}
