// plugins/run-observer/tests/register.test.ts
import { describe, expect, it } from 'vitest';
import { MockRuntime } from '@agentic-sdlc-kit/mod-sdk';
import { register } from '../hooks/register.js';
import type { TraceStore } from '../policies/trace-store.js';

describe('run-observer register', () => {
  it('registers handlers for session.start, turn.start, tool.call, turn.complete', () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    expect(runtime.registrationCount('session.start')).toBe(1);
    expect(runtime.registrationCount('turn.start')).toBe(1);
    expect(runtime.registrationCount('tool.call')).toBe(1);
    expect(runtime.registrationCount('turn.complete')).toBe(1);
  });

  it('records events through the lifecycle and exposes the store via $.state', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    await runtime.fire('session.start', { sessionId: 'S-1' });
    await runtime.fire('turn.start', { runId: 'RUN-001' });
    await runtime.fire('tool.call', { tool: 'Bash', input: {} });
    await runtime.fire('turn.complete', { runId: 'RUN-001', tokensIn: 100, tokensOut: 50 });
    const store = runtime.getState<TraceStore>({ plugin: 'run-observer', key: 'store' });
    expect(store).toBeDefined();
    const run = store?.getRun('RUN-001');
    expect(run?.events.length).toBeGreaterThanOrEqual(2); // turn-start + tool-call + turn-complete
  });

  it('marks turn-complete as partial when tokensIn is missing', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    await runtime.fire('turn.start', { runId: 'RUN-001' });
    await runtime.fire('turn.complete', { runId: 'RUN-001' }); // no tokens
    const store = runtime.getState<TraceStore>({ plugin: 'run-observer', key: 'store' });
    const run = store?.getRun('RUN-001');
    const complete = run?.events.find((e) => e.kind === 'turn-complete');
    expect(complete?.partial).toBe(true);
  });
});
