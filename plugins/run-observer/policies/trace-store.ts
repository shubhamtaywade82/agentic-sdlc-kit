// plugins/run-observer/policies/trace-store.ts
//
// In-memory execution trace store. Both events per run and retained run
// records are bounded; the full persistence (to .ai-kit/reports/runs/)
// lands with the M13 file-backed collector.
//
// Modeled after Mission Control (RESEARCH.md §4): hierarchical runtime
// tree with bounded state.

import type { ObserverEvent, RetentionPolicy } from './types';

interface RunRecord {
  runId: string;
  startedAt: string;
  events: ObserverEvent[];
  // Bounded per the retention policy.
  truncated: boolean;
}

export class TraceStore {
  private runs = new Map<string, RunRecord>();
  // #private: the host freezes atom() values; a frozen object can't bump a normal field.
  #idCounter = 0;

  constructor(
    private readonly policy: RetentionPolicy,
    private readonly maxRuns = 100,
  ) {
    if (!Number.isInteger(maxRuns) || maxRuns < 1) {
      throw new RangeError('maxRuns must be a positive integer');
    }
  }

  record(event: ObserverEvent): void {
    let run = this.runs.get(event.runId);
    if (!run) {
      // Map insertion order is oldest-to-newest. Evict the oldest run before
      // adding a new one so memory remains bounded across long sessions.
      while (this.runs.size >= this.maxRuns) {
        const oldestRunId = this.runs.keys().next().value;
        if (oldestRunId === undefined) break;
        this.runs.delete(oldestRunId);
      }
      run = { runId: event.runId, startedAt: event.at, events: [], truncated: false };
      this.runs.set(event.runId, run);
    }
    if (run.events.length >= this.policy.maxEventsPerRun) {
      run.truncated = true;
      return;
    }
    run.events.push(event);
  }

  getRun(runId: string): RunRecord | undefined {
    return this.runs.get(runId);
  }

  listRuns(): ReadonlyArray<{
    runId: string;
    startedAt: string;
    eventCount: number;
    truncated: boolean;
  }> {
    return Array.from(this.runs.values()).map((r) => ({
      runId: r.runId,
      startedAt: r.startedAt,
      eventCount: r.events.length,
      truncated: r.truncated,
    }));
  }

  nextEventId(): string {
    this.#idCounter = this.#idCounter + 1;
    return `EVT-${this.#idCounter.toString().padStart(4, '0')}`;
  }
}
