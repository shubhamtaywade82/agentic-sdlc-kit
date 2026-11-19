// packages/core/src/tdd/cycle.ts
//
// TDD State Machine enforcing the Red-Green-Refactor discipline.
// Red phase requires observed failure before implementation proceeds.

import { Errors, type Result } from "@agentic-sdlc-kit/contracts";

export type TddPhase = "red" | "green" | "refactor" | "completed";

export interface TddStepRecord {
  readonly phase: TddPhase;
  readonly status: "passed" | "failed";
  readonly timestamp: string;
  readonly evidence?: string;
}

export class TddSession {
  private phase: TddPhase = "red";
  private readonly records: TddStepRecord[] = [];

  constructor(readonly taskId: string) {}

  getCurrentPhase(): TddPhase {
    return this.phase;
  }

  getHistory(): readonly TddStepRecord[] {
    return [...this.records];
  }

  advance(outcome: { status: "passed" | "failed"; evidence?: string }): Result<TddPhase> {
    const timestamp = new Date().toISOString();
    this.records.push({ phase: this.phase, status: outcome.status, timestamp, evidence: outcome.evidence });

    if (this.phase === "red") {
      if (outcome.status !== "failed") {
        return {
          ok: false,
          error: Errors.verificationFailed("TDD Red phase invariant violated: targeted test must fail before implementing"),
        };
      }
      this.phase = "green";
      return { ok: true, value: this.phase };
    }

    if (this.phase === "green") {
      if (outcome.status !== "passed") {
        return {
          ok: false,
          error: Errors.verificationFailed("TDD Green phase failed: targeted test must pass after implementation"),
        };
      }
      this.phase = "refactor";
      return { ok: true, value: this.phase };
    }

    if (this.phase === "refactor") {
      if (outcome.status !== "passed") {
        return {
          ok: false,
          error: Errors.verificationFailed("TDD Refactor phase failed: tests must remain passing during refactoring"),
        };
      }
      this.phase = "completed";
      return { ok: true, value: this.phase };
    }

    return { ok: true, value: "completed" };
  }
}
