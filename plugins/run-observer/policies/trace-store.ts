// plugins/run-observer/policies/trace-store.ts
//
// In-memory execution trace store. Bounded to maxEventsPerRun (per M13
// retention policy). The full persistence (to .ai-kit/reports/runs/)
// lands with the M13 file-backed collector; this is the contract surface.
//
// Modeled after Mission Control (RESEARCH.md §4): hierarchical runtime
// tree with bounded state.

import type { ObserverEvent, RetentionPolicy } from './types.js';

interface RunRecord {
  runId: string;
  startedAt: string;
  events: ObserverEvent[];
  // Bounded per the retention policy.
  truncated: boolean;
}

export class TraceStore {
  private runs = new Map<string, RunRecord>();
  private idCounter = 0;

  constructor(private readonly policy: RetentionPolicy) {}

  record(event: ObserverEvent): void {
    let run = this.runs.get(event.runId);
    if (!run) {
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
    return `EVT-${(++this.idCounter).toString().padStart(4, '0')}`;
  }
}
