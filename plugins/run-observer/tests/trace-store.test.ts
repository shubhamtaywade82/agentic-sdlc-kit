// plugins/run-observer/tests/trace-store.test.ts
import { describe, expect, it } from 'vitest';
import { TraceStore } from '../policies/trace-store.js';
import type { ObserverEvent, RetentionPolicy } from '@agentic-sdlc-kit/contracts';

const policy: RetentionPolicy = {
  schemaVersion: 1,
  retainDays: 30,
  maxEventsPerRun: 3,
  redactSummaries: true,
  dropUsageData: false,
  redactPathPatterns: [],
};

function makeEvent(runId: string, kind: ObserverEvent['kind'], summary: string): ObserverEvent {
  return {
    schemaVersion: 1,
    id: `EVT-${Math.random().toString(36).slice(2, 8)}`,
    runId,
    at: '2026-01-01T00:00:00.000Z',
    kind,
    summary,
    partial: false,
  };
}

describe('TraceStore', () => {
  it('records and retrieves events by runId', () => {
    const store = new TraceStore(policy);
    store.record(makeEvent('RUN-001', 'turn-start', 'run started'));
    store.record(makeEvent('RUN-001', 'tool-call', 'tool=Bash'));
    const run = store.getRun('RUN-001');
    expect(run?.events).toHaveLength(2);
    expect(run?.events[0]?.kind).toBe('turn-start');
  });

  it('marks a run as truncated when maxEventsPerRun is exceeded', () => {
    const store = new TraceStore(policy);
    for (let i = 0; i < 5; i++) {
      store.record(makeEvent('RUN-001', 'tool-call', `tool=${i}`));
    }
    const run = store.getRun('RUN-001');
    expect(run?.events).toHaveLength(3); // capped at maxEventsPerRun
    expect(run?.truncated).toBe(true);
  });

  it('lists all runs', () => {
    const store = new TraceStore(policy);
    store.record(makeEvent('RUN-001', 'turn-start', 'r1'));
    store.record(makeEvent('RUN-002', 'turn-start', 'r2'));
    const list = store.listRuns();
    expect(list).toHaveLength(2);
    expect(list.map((r) => r.runId)).toContain('RUN-001');
    expect(list.map((r) => r.runId)).toContain('RUN-002');
  });
});

describe('TraceStore when frozen by the host', () => {
  it('still records events and issues ids', () => {
    const store = Object.freeze(new TraceStore(policy));
    expect(store.nextEventId()).toBe('EVT-0001');
    store.record(makeEvent('RUN-001', 'turn-start', 'r'));
    expect(store.getRun('RUN-001')?.events).toHaveLength(1);
  });
});
