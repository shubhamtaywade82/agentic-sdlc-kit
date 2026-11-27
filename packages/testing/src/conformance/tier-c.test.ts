// packages/testing/src/conformance/tier-c.test.ts
//
// Unit tests for the Tier C conformance harness itself: a conforming
// scripted driver must pass the golden trace; protocol deviations must
// be reported as failing steps, never crash the harness.
import { describe, expect, it } from 'vitest';
import type { JournalEvent, NextAction } from '@agentic-sdlc-kit/contracts';
import {
  expectedJournalKinds,
  runTierCConformanceTrace,
  TIER_C_GOLDEN_TRACE,
  type TierCConformanceDriver,
  type TierCDriverStepResult,
} from './tier-c.js';

const FEATURE = 'FEATURE-001';
const TASKS = ['TASK-001', 'TASK-002'] as const;

function nextAction(requiredAction: NextAction['requiredAction'], taskId?: string): NextAction {
  return {
    schemaVersion: 1,
    featureId: FEATURE,
    status: requiredAction === 'feature.start' ? 'pending' : 'in_progress',
    ...(taskId !== undefined ? { taskId, phase: 'red' as const } : {}),
    requiredAction,
    verificationCommand: taskId !== undefined ? ['node', 'check.js'] : [],
    nextInvocation: 'kit …',
    blockingQuestions: [],
    advisoryLessons: [],
    constraints: { timeoutMs: 60_000, maxOutputBytes: 10_485_760 },
  };
}

function journalEvent(kind: JournalEvent['kind'], seq: number): JournalEvent {
  return {
    schemaVersion: 1,
    seq,
    ts: '2026-11-22T00:00:00.000Z',
    featureId: FEATURE,
    kind,
    actor: { kind: 'agent', host: 'fake-driver' },
    payload: {},
    prevHash: seq === 0 ? 'GENESIS' : `${seq - 1}`.padEnd(64, '0'),
    hash: `${seq}`.padEnd(64, '0'),
  };
}

const ok: TierCDriverStepResult = { ok: true };

/**
 * A scripted, CONFORMING kit behind the driver: it walks exactly the
 * protocol the CLI implements. Used to prove the harness accepts the
 * golden path.
 */
function conformingDriver(): TierCConformanceDriver {
  let started = false;
  const completedPhases = new Map<string, number>(); // taskId -> phases done
  let verified = false;
  return {
    async start() {
      started = true;
      return ok;
    },
    async next(_featureId: string): Promise<NextAction> {
      if (!started) return nextAction('feature.start');
      if (verified) return { ...nextAction('run.completed'), status: 'completed' };
      for (const taskId of TASKS) {
        const done = completedPhases.get(taskId) ?? 0;
        if (done === 0) return nextAction('task.red', taskId);
        if (done === 1) return { ...nextAction('task.green', taskId), phase: 'green' };
        if (done === 2) return { ...nextAction('task.refactor', taskId), phase: 'refactor' };
      }
      return nextAction('feature.verify');
    },
    async runPhase(_f: string, taskId: string) {
      completedPhases.set(taskId, (completedPhases.get(taskId) ?? 0) + 1);
      return ok;
    },
    async verify() {
      verified = true;
      return ok;
    },
    async journal() {
      return expectedJournalKinds(TASKS).map((kind, i) => journalEvent(kind, i));
    },
    async verifyJournal() {
      return { valid: true, eventCount: expectedJournalKinds(TASKS).length };
    },
    async applyImplementation() {
      /* the fake host "implements" */
    },
  };
}

describe('runTierCConformanceTrace', () => {
  it('passes a conforming driver through the full golden trace', async () => {
    const report = await runTierCConformanceTrace(conformingDriver(), {
      featureId: FEATURE,
      taskIds: TASKS,
    });
    expect(report.passed).toBe(true);
    expect(report.steps.every((s) => s.passed)).toBe(true);
    expect(report.steps.map((s) => s.step)).toEqual([
      'next',
      'start',
      'next(TASK-001)',
      'red(TASK-001)',
      'next(TASK-001)',
      'green(TASK-001)',
      'next(TASK-001)',
      'refactor(TASK-001)',
      'next(TASK-002)',
      'red(TASK-002)',
      'next(TASK-002)',
      'green(TASK-002)',
      'next(TASK-002)',
      'refactor(TASK-002)',
      'next',
      'verify',
      'next',
      'journal --verify',
    ]);
  });

  it('reports a protocol deviation (green skipped) as a failing step, not a crash', async () => {
    const driver = conformingDriver();
    const originalNext = driver.next.bind(driver);
    const deviating: TierCConformanceDriver = {
      ...driver,
      async next(featureId: string) {
        const action = await originalNext(featureId);
        if (action.requiredAction === 'task.green') {
          // A non-conforming host skips straight to refactor.
          return { ...action, requiredAction: 'task.refactor' };
        }
        return action;
      },
    };
    const report = await runTierCConformanceTrace(deviating, {
      featureId: FEATURE,
      taskIds: TASKS,
    });
    expect(report.passed).toBe(false);
    const failed = report.steps.filter((s) => !s.passed);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0]?.expected).toBe('task.green');
  });

  it('reports a broken journal chain as a failing journal step', async () => {
    const driver = conformingDriver();
    const broken: TierCConformanceDriver = {
      ...driver,
      async verifyJournal() {
        return { valid: false, eventCount: 5, reason: 'hash mismatch at seq 3' };
      },
    };
    const report = await runTierCConformanceTrace(broken, {
      featureId: FEATURE,
      taskIds: TASKS,
    });
    expect(report.passed).toBe(false);
    const journalStep = report.steps.find((s) => s.step === 'journal --verify');
    expect(journalStep?.passed).toBe(false);
    expect(journalStep?.actual).toContain('hash mismatch');
  });

  it('exposes the golden trace for documentation and adapters', async () => {
    expect(TIER_C_GOLDEN_TRACE.length).toBeGreaterThan(0);
    expect(TIER_C_GOLDEN_TRACE[0]).toBe('next -> feature.start');
    expect(TIER_C_GOLDEN_TRACE[TIER_C_GOLDEN_TRACE.length - 1]).toBe('journal --verify -> valid');
    expect(expectedJournalKinds(['TASK-001'])).toEqual([
      'workflow.started',
      'next.offered',
      'phase.recorded',
      'next.offered',
      'phase.recorded',
      'next.offered',
      'phase.recorded',
      'next.offered',
      'workflow.finalized',
      'next.offered',
    ]);
  });
});
