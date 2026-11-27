// packages/testing/src/conformance/tier-c.ts
//
// Tier C host conformance harness (ADR-0021 §5): an executable golden
// trace of the host-driven agent protocol.
//
// Tier C hosts (Cursor, AGY, CI, any terminal-capable agent) drive the
// kit through the CLI. "Works the same as Claude Code" must be a TESTED
// claim, not a documented one: this harness defines the canonical
// protocol sequence every host must be able to execute, and any host
// adapter proves conformance by implementing the driver against its own
// stack and running the same trace.
//
// Architecture note: this module imports ONLY contracts (the package
// invariant). Everything host- or kit-specific — command invocation,
// hash verification — lives behind the driver interface. The CLI's
// driver (packages/cli) backs every operation with a real command
// invocation; a future cursor-adapter driver would back it with
// Cursor's terminal tool, and the golden trace must pass identically.

import type { JournalEvent, NextAction } from '@agentic-sdlc-kit/contracts';

/** Result of one protocol action executed through the host. */
export interface TierCDriverStepResult {
  readonly ok: boolean;
  readonly message?: string;
}

export type TierCPhase = 'red' | 'green' | 'refactor';

/**
 * The host-side executor. Every method is one protocol action a Tier C
 * host must be able to perform. Implementations MUST go through the
 * host's real path (for the CLI driver: the actual commands), never a
 * shortcut — a conformance run against a bypass proves nothing.
 */
export interface TierCConformanceDriver {
  /** `kit feature <id> start` */
  start(featureId: string): Promise<TierCDriverStepResult>;
  /** `kit next <id> --json` */
  next(featureId: string): Promise<NextAction>;
  /** `kit feature <id> <phase> <taskId>` */
  runPhase(featureId: string, taskId: string, phase: TierCPhase): Promise<TierCDriverStepResult>;
  /** `kit feature <id> verify` */
  verify(featureId: string): Promise<TierCDriverStepResult>;
  /** `kit journal <id> --json` */
  journal(featureId: string): Promise<readonly JournalEvent[]>;
  /** `kit journal <id> --verify --json` */
  verifyJournal(featureId: string): Promise<{
    valid: boolean;
    eventCount: number;
    reason?: string;
  }>;
  /**
   * The host does its actual work between phases: write the failing
   * test before red, implement before green, refactor before refactor.
   * In fixtures this is a marker file; in a real host it is the agent.
   */
  applyImplementation(featureId: string, taskId: string): Promise<void>;
}

export interface ConformanceStep {
  readonly step: string;
  readonly expected: string;
  readonly actual: string;
  readonly passed: boolean;
}

export interface TierCConformanceReport {
  readonly featureId: string;
  readonly passed: boolean;
  readonly steps: readonly ConformanceStep[];
  /** The golden trace, human-readable, for ADR-0021 §5 documentation. */
  readonly goldenTrace: readonly string[];
}

/**
 * The canonical golden trace (single task): the sequence of protocol
 * states a conforming host observes. Multi-task runs repeat the
 * task.red -> task.refactor block per task, in plan execution order.
 */
export const TIER_C_GOLDEN_TRACE: readonly string[] = [
  'next -> feature.start',
  'start -> ok',
  'next -> task.red',
  'red -> ok (evidence: failed as expected, classified assertion)',
  'next -> task.green',
  'applyImplementation (host writes the implementation)',
  'green -> ok (evidence: passed)',
  'next -> task.refactor',
  'refactor -> ok (evidence: passed)',
  'next -> feature.verify',
  'verify -> ok (evidence chain audited, final verification passed)',
  'next -> run.completed',
  'journal --verify -> valid',
];

function step(
  stepName: string,
  expected: string,
  actual: string,
  passed: boolean,
): ConformanceStep {
  return { step: stepName, expected, actual, passed };
}

/**
 * Drive one feature run through the golden trace and report every
 * observed protocol state. The harness NEVER writes files and NEVER
 * invokes the kit itself — the driver is the only actor.
 */
export async function runTierCConformanceTrace(
  driver: TierCConformanceDriver,
  opts: { featureId: string; taskIds: readonly string[] },
): Promise<TierCConformanceReport> {
  const { featureId, taskIds } = opts;
  const steps: ConformanceStep[] = [];
  const record = (s: ConformanceStep): void => {
    steps.push(s);
  };

  // next -> feature.start (before any run exists)
  let action = await driver.next(featureId);
  record(
    step('next', 'feature.start', action.requiredAction, action.requiredAction === 'feature.start'),
  );

  // start -> ok
  const startRes = await driver.start(featureId);
  record(step('start', 'ok', startRes.ok ? 'ok' : (startRes.message ?? 'failed'), startRes.ok));

  for (const taskId of taskIds) {
    // next -> task.red
    action = await driver.next(featureId);
    const expectRed =
      action.requiredAction === 'task.red' && action.taskId === taskId && action.phase === 'red';
    record(
      step(
        `next(${taskId})`,
        'task.red',
        `${action.requiredAction}${action.taskId ? ` ${action.taskId}` : ''}`,
        expectRed,
      ),
    );

    // The host writes the failing test FIRST, then records red. In the
    // fixture the plan's verification command IS the test; the visible
    // host-side work is applyImplementation before green.
    const redRes = await driver.runPhase(featureId, taskId, 'red');
    record(
      step(`red(${taskId})`, 'ok', redRes.ok ? 'ok' : (redRes.message ?? 'failed'), redRes.ok),
    );

    // next -> task.green
    action = await driver.next(featureId);
    const expectGreen = action.requiredAction === 'task.green' && action.taskId === taskId;
    record(
      step(
        `next(${taskId})`,
        'task.green',
        `${action.requiredAction}${action.taskId ? ` ${action.taskId}` : ''}`,
        expectGreen,
      ),
    );

    await driver.applyImplementation(featureId, taskId);

    const greenRes = await driver.runPhase(featureId, taskId, 'green');
    record(
      step(
        `green(${taskId})`,
        'ok',
        greenRes.ok ? 'ok' : (greenRes.message ?? 'failed'),
        greenRes.ok,
      ),
    );

    // next -> task.refactor
    action = await driver.next(featureId);
    const expectRefactor = action.requiredAction === 'task.refactor' && action.taskId === taskId;
    record(
      step(
        `next(${taskId})`,
        'task.refactor',
        `${action.requiredAction}${action.taskId ? ` ${action.taskId}` : ''}`,
        expectRefactor,
      ),
    );

    const refactorRes = await driver.runPhase(featureId, taskId, 'refactor');
    record(
      step(
        `refactor(${taskId})`,
        'ok',
        refactorRes.ok ? 'ok' : (refactorRes.message ?? 'failed'),
        refactorRes.ok,
      ),
    );
  }

  // next -> feature.verify
  action = await driver.next(featureId);
  record(
    step(
      'next',
      'feature.verify',
      action.requiredAction,
      action.requiredAction === 'feature.verify',
    ),
  );

  const verifyRes = await driver.verify(featureId);
  record(step('verify', 'ok', verifyRes.ok ? 'ok' : (verifyRes.message ?? 'failed'), verifyRes.ok));

  // next -> run.completed
  action = await driver.next(featureId);
  record(
    step(
      'next',
      'run.completed',
      action.requiredAction,
      action.requiredAction === 'run.completed' && action.status === 'completed',
    ),
  );

  // journal -> the executed record, chain-valid, with the golden event kinds
  const journalVerify = await driver.verifyJournal(featureId);
  const events = await driver.journal(featureId);
  const expectedKinds = expectedJournalKinds(taskIds);
  const expectedKindsText = expectedKinds.join(',');
  const actualKinds = events.map((e) => e.kind).join(',');
  const journalOk =
    journalVerify.valid &&
    journalVerify.eventCount === expectedKinds.length &&
    actualKinds === expectedKindsText;
  record(
    step(
      'journal --verify',
      `${expectedKinds.length} events, chain valid`,
      journalVerify.valid
        ? `${journalVerify.eventCount} events${actualKinds === expectedKindsText ? '' : `, kinds: ${actualKinds}`}`
        : (journalVerify.reason ?? 'chain invalid'),
      journalOk,
    ),
  );

  return {
    featureId,
    passed: steps.every((s) => s.passed),
    steps,
    goldenTrace: TIER_C_GOLDEN_TRACE,
  };
}

/**
 * The golden journal for a clean run: one started, one finalized, and per
 * task one recorded verdict per phase. Each protocol offer is recorded when
 * it changes (`next.offered`), so every state the host is offered appears
 * once, right before the verdict that answers it. The offers are part of the
 * golden record: a conforming host's `kit next` calls produce them.
 * Rejected/failed attempts are legal in real runs (they are auditable
 * evidence); the golden trace is the happy path a host must reproduce exactly.
 */
export function expectedJournalKinds(taskIds: readonly string[]): string[] {
  const kinds: string[] = ['workflow.started'];
  for (const _taskId of taskIds) {
    // red, green and refactor are each offered, then answered by a verdict.
    kinds.push(
      'next.offered',
      'phase.recorded',
      'next.offered',
      'phase.recorded',
      'next.offered',
      'phase.recorded',
    );
  }
  // feature.verify is offered, the final verdict is recorded, then run.completed is offered.
  kinds.push('next.offered', 'workflow.finalized', 'next.offered');
  return kinds;
}
