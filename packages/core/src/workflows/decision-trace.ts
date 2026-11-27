// packages/core/src/workflows/decision-trace.ts
//
// Decision trace (item 3): the actions the kit offered a host, recorded when
// the offer changes. The journal already holds the gate's verdicts
// (phase.recorded, phase.rejected, phase.failed), each stamped with the
// evidenceId it judged. This adds the other half, so an audit can read every
// action proposed and every verdict given, in one hash-chained log.
//
// Recording is telemetry, like the verdict journal: a failed append never
// blocks `kit next`. The run state remains the authority.

import type { NextAction } from '@agentic-sdlc-kit/contracts';
import { appendJournalEvent, readJournal } from './journal.js';

/** Identity of one offer. Two offers with the same key are the same offer. */
function offerKey(action: NextAction): string {
  return JSON.stringify([
    action.requiredAction,
    action.taskId ?? null,
    action.phase ?? null,
    action.recoveryHint ? [action.recoveryHint.classification, action.recoveryHint.attempt] : null,
  ]);
}

/** The key of the most recent recorded offer, or undefined when none is recorded. */
async function lastRecordedOffer(projectRoot: string, featureId: string): Promise<string | undefined> {
  const journal = await readJournal(projectRoot, featureId);
  if (!journal.ok) return undefined;
  const offers = journal.value.filter((e) => e.kind === 'next.offered');
  const last = offers[offers.length - 1];
  const key = last?.payload['offerKey'];
  return typeof key === 'string' ? key : undefined;
}

/**
 * Record an offer unless it repeats the last one recorded. A protocol start
 * offers nothing about a run yet, so it is not recorded.
 */
export async function recordNextOffer(projectRoot: string, action: NextAction): Promise<void> {
  if (action.requiredAction === 'feature.start') return;
  const key = offerKey(action);
  if ((await lastRecordedOffer(projectRoot, action.featureId)) === key) return;
  await appendJournalEvent(projectRoot, {
    featureId: action.featureId,
    ...(action.taskId !== undefined ? { taskId: action.taskId } : {}),
    kind: 'next.offered',
    actor: { kind: 'kit' },
    payload: {
      offerKey: key,
      requiredAction: action.requiredAction,
      taskId: action.taskId ?? null,
      phase: action.phase ?? null,
      nextInvocation: action.nextInvocation,
      recoveryClassification: action.recoveryHint?.classification ?? null,
      recoveryAttempt: action.recoveryHint?.attempt ?? null,
    },
  });
}
