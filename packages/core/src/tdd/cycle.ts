// packages/core/src/tdd/cycle.ts
//
// TDD State Machine enforcing the Red-Green-Refactor discipline.
// Red phase requires observed failure before implementation proceeds.

import { Errors, type Result, type StrengthEvidence } from '@agentic-sdlc-kit/contracts';
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
  /**
   * Test-strength (mutation) evidence for a completed task
   * (ADR-0022). Absent unless the project opts in via
   * `verification.strength.enabled`. Strength never affects the
   * Red -> Green -> Refactor phase machine; it is recorded on top of
   * a completed chain and audited separately.
   */
  readonly strength?: StrengthEvidence;
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

  /**
   * Record test-strength (mutation) evidence for a COMPLETED task
   * (ADR-0022). Strength is a post-refactor measurement: it presupposes
   * a complete Red -> Green -> Refactor chain, so recording it on an
   * incomplete task is rejected — the evidence would claim to measure
   * a suite that has not finished forming. Repeated calls append new
   * measurements (the latest one is the audited score; the history is
   * kept, like phase attempts).
   */
  recordStrength(evidence: StrengthEvidence): Result<true> {
    if (this.phase !== 'completed') {
      return {
        ok: false,
        error: Errors.verificationFailed(
          'TDD strength evidence requires a completed Red -> Green -> Refactor chain ' +
            `first (task is in phase '${this.phase}')`,
        ),
      };
    }
    this.records.push({
      phase: 'completed',
      status: 'passed',
      timestamp: new Date().toISOString(),
      strength: evidence,
    });
    return { ok: true, value: true };
  }

  /**
   * Latest strength evidence recorded for the task, if any. The audit
   * gate reads this (the last measurement is the current score; earlier
   * ones are history).
   */
  latestStrength(): StrengthEvidence | undefined {
    for (let i = this.records.length - 1; i >= 0; i--) {
      const s = this.records[i]?.strength;
      if (s !== undefined) return s;
    }
    return undefined;
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
