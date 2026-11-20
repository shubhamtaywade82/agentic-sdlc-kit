// packages/core/src/tdd/cycle.ts
//
// TDD State Machine enforcing the Red-Green-Refactor discipline.
// Red phase requires observed failure before implementation proceeds.

import { Errors, type Result } from '@agentic-sdlc-kit/contracts';
import type { FailureClassification } from '../verification/classification.js';

export type TddPhase = 'red' | 'green' | 'refactor' | 'completed';

export interface TddStepRecord {
  readonly phase: TddPhase;
  readonly status: 'passed' | 'failed';
  readonly timestamp: string;
  readonly evidence?: string;
  /**
   * Task-targeted verification metadata (schema v2, ADR-0018 P1).
   * Absent on records written by the pre-v2 engine; such records are
   * treated as unclassified and rejected by the Red evidence gate.
   */
  readonly verification?: TddStepVerification;
}

/** How a phase step was actually verified: the task's own command, its
 * structured failure classification, and why it was classified so. */
export interface TddStepVerification {
  readonly taskId: string;
  readonly command: readonly string[];
  /** `null` when the command exited 0; a failure classification otherwise. */
  readonly classification: FailureClassification | null;
  readonly reason: string;
}

/**
 * Persisted state of a TDD session, used to resume a session across
 * process boundaries (the agent implements between workflow invocations,
 * so the session must survive process exits — ADR-0018).
 */
export interface TddSessionSnapshot {
  readonly phase: TddPhase;
  readonly records: readonly TddStepRecord[];
}

export class TddSession {
  private phase: TddPhase = 'red';
  private readonly records: TddStepRecord[] = [];

  constructor(
    readonly taskId: string,
    snapshot?: TddSessionSnapshot,
  ) {
    if (snapshot) {
      this.phase = snapshot.phase;
      this.records.push(...snapshot.records);
    }
  }

  getCurrentPhase(): TddPhase {
    return this.phase;
  }

  getHistory(): readonly TddStepRecord[] {
    return [...this.records];
  }

  /**
   * Record a step attempt WITHOUT transitioning the phase. Used when the
   * phase gate rejects the attempt (e.g. a Red failure classified as
   * `compilation` instead of `assertion`): the attempt is real, auditable
   * evidence, but it does not satisfy the phase invariant, so the state
   * machine must not advance. Rejected records cannot later satisfy the
   * Red chain requirement (their classification is not `assertion`).
   */
  recordRejected(outcome: {
    status: 'passed' | 'failed';
    evidence?: string;
    verification?: TddStepVerification;
  }): void {
    this.records.push({
      phase: this.phase,
      status: outcome.status,
      timestamp: new Date().toISOString(),
      ...(outcome.evidence !== undefined ? { evidence: outcome.evidence } : {}),
      ...(outcome.verification !== undefined ? { verification: outcome.verification } : {}),
    });
  }

  advance(outcome: {
    status: 'passed' | 'failed';
    evidence?: string;
    verification?: TddStepVerification;
  }): Result<TddPhase> {
    const timestamp = new Date().toISOString();
    this.records.push({
      phase: this.phase,
      status: outcome.status,
      timestamp,
      ...(outcome.evidence !== undefined ? { evidence: outcome.evidence } : {}),
      ...(outcome.verification !== undefined ? { verification: outcome.verification } : {}),
    });

    if (this.phase === 'red') {
      if (outcome.status !== 'failed') {
        return {
          ok: false,
          error: Errors.verificationFailed(
            'TDD Red phase invariant violated: targeted test must fail before implementing',
          ),
        };
      }
      this.phase = 'green';
      return { ok: true, value: this.phase };
    }

    if (this.phase === 'green') {
      if (outcome.status !== 'passed') {
        return {
          ok: false,
          error: Errors.verificationFailed(
            'TDD Green phase failed: targeted test must pass after implementation',
          ),
        };
      }
      this.phase = 'refactor';
      return { ok: true, value: this.phase };
    }

    if (this.phase === 'refactor') {
      if (outcome.status !== 'passed') {
        return {
          ok: false,
          error: Errors.verificationFailed(
            'TDD Refactor phase failed: tests must remain passing during refactoring',
          ),
        };
      }
      this.phase = 'completed';
      return { ok: true, value: this.phase };
    }

    return { ok: true, value: 'completed' };
  }
}
