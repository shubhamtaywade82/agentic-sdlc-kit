// plugins/run-observer/tests/register.test.ts
//
// Behavioral tests against the MockRuntime, which mirrors the REAL host
// contract: turn.start carries e.turnId; turn.complete carries e.usage;
// turn.step streams (yield* delegation) and its result carries the
// answering model under result.usage.model; timestamps come from
// `await $.clock.now()` — never a frozen epoch value.
import { describe, expect, it } from 'vitest';
import { MockRuntime } from '@agentic-sdlc-kit/mod-sdk';
import { register } from '../hooks/register';
import type { TraceStore } from '../policies/trace-store';

describe('run-observer register', () => {
  it('registers handlers for session.start, turn.start, turn.step, tool.call, turn.complete', () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    expect(runtime.registrationCount('session.start')).toBe(1);
    expect(runtime.registrationCount('turn.start')).toBe(1);
    expect(runtime.registrationCount('turn.step')).toBe(1);
    expect(runtime.registrationCount('tool.call')).toBe(1);
    expect(runtime.registrationCount('turn.complete')).toBe(1);
  });

  it('records events through the lifecycle with REAL timestamps', async () => {
    const runtime = new MockRuntime(Date.parse('2026-11-20T12:00:00.000Z'));
    runtime.setSession('S-1');
    runtime.load(register);
    runtime.advanceClock(1_000);
    await runtime.fire('session.start', {});
    await runtime.fire('turn.start', { turnId: 'TURN-001' });
    runtime.advanceClock(2_000);
    runtime.setHostResult({ text: 'ok', isError: false });
    await runtime.fire('tool.call', { tool: 'Bash', command: 'ls' });
    runtime.advanceClock(3_000);
    await runtime.fire('turn.complete', {
      turnId: 'TURN-001',
      answer: 'done',
      durationMs: 6_000,
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    const store = runtime.getState<TraceStore>({ plugin: 'run-observer', key: 'store' });
    expect(store).toBeDefined();
    const run = store?.getRun('TURN-001');
    expect(run?.events.length).toBeGreaterThanOrEqual(3);
    // Real timestamps from the clock — never 1970-01-01.
    for (const event of run?.events ?? []) {
      expect(event.at).not.toMatch(/^1970-01-01/);
    }
    expect(run?.events[0]?.at).toBe('2026-11-20T12:00:01.000Z');
    // turn-complete carries the host's usage, not fabricated numbers.
    const complete = run?.events.find((e) => e.kind === 'turn-complete');
    expect(complete?.tokensIn).toBe(100);
    expect(complete?.tokensOut).toBe(50);
    expect(complete?.partial).toBe(false);
  });

  it('records turn.step results (model + usage) via yield* delegation', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    // Official TurnStepResult shape: the answering model rides under
    // result.usage.model.
    runtime.setHostResult({ usage: { input_tokens: 10, output_tokens: 5, model: 'sonnet' } });
    runtime.setHostChunks(['a', 'b']);
    const result = await runtime.fire('turn.step', { model: 'sonnet' });
    // The observer passed the stream through untouched.
    expect(result.forwarded).toBe(true);
    expect(result.chunks).toEqual(['a', 'b']);
    expect(result.value).toEqual({
      usage: { input_tokens: 10, output_tokens: 5, model: 'sonnet' },
    });
    // ...and recorded what came back.
    runtime.advanceClock(1);
    await runtime.fire('turn.complete', { answer: 'x', durationMs: 1 });
    const store = runtime.getState<TraceStore>({ plugin: 'run-observer', key: 'store' });
    const step = store?.getRun('RUN-0001')?.events.find((e) => e.kind === 'turn-step');
    expect(step?.model).toBe('sonnet');
    expect(step?.tokensIn).toBe(10);
    expect(step?.tokensOut).toBe(5);
  });

  it('marks turn-complete as partial when usage is missing', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    await runtime.fire('turn.start', { turnId: 'TURN-001' });
    await runtime.fire('turn.complete', { turnId: 'TURN-001', answer: 'x', durationMs: 5 }); // no usage
    const store = runtime.getState<TraceStore>({ plugin: 'run-observer', key: 'store' });
    const complete = store?.getRun('TURN-001')?.events.find((e) => e.kind === 'turn-complete');
    expect(complete?.partial).toBe(true);
  });

  it('records tool failures and refusals as not-ok', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    runtime.setHostResult({ isError: true });
    await runtime.fire('tool.call', { tool: 'Bash', command: 'boom' });
    // The store is exposed via $.state on turn.complete.
    await runtime.fire('turn.complete', { answer: 'x', durationMs: 5 });
    const store = runtime.getState<TraceStore>({ plugin: 'run-observer', key: 'store' });
    const call = store?.getRun('RUN-0001')?.events.find((e) => e.kind === 'tool-call');
    expect(call?.summary).toMatch(/ok=false/);
  });

  it('NEVER blocks turn.complete when publishing observer state fails', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    Object.defineProperty(runtime.api.state, 'set', {
      value: async () => {
        throw new Error('state backend unavailable');
      },
    });

    const result = await runtime.fire('turn.complete', {
      turnId: 'TURN-STATE-FAIL',
      answer: 'done',
      durationMs: 1,
    });

    expect(result.forwarded).toBe(true);
    expect(result.answered).toBe(false);
  });

  it('NEVER blocks the chain when its own work fails', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    // Break the observer's own recording: the store key is fine, but a
    // poisoned clock makes `await $.clock.now()` throw inside observe().
    // The handler must swallow the error and still forward the event.
    const originalNow = Object.getOwnPropertyDescriptor(runtime.api.clock, 'now');
    expect(originalNow).toBeDefined();
    Object.defineProperty(runtime.api.clock, 'now', {
      value: () => {
        throw new Error('clock exploded');
      },
    });
    const result = await runtime.fire('turn.start', { turnId: 'TURN-X' });
    expect(result.forwarded).toBe(true);
    // ...and (per e21a473) the failure is swallowed silently: telemetry must
    // never spam or disrupt the user, so the old "turn-start failed" notice
    // is intentionally gone.
    expect(runtime.getLogs().some((l) => l.includes('turn-start failed'))).toBe(false);
  });
});
