// packages/testing/src/validators/agent-provider-contract.test.ts
//
// Runs the reusable AgentProvider contract harness (v2) against the
// in-package MockAgentProvider. This proves the harness and the mock agree
// on the M36 contract. Real provider packages (provider-claude-code, etc.)
// will run the same harness against their own adapter.

import { describe, expect, it } from 'vitest';
import {
  AgentExecutionResultSchema,
  type AgentExecutionRequest,
} from '@agentic-sdlc-kit/contracts';
import { MockAgentProvider, SAMPLE_POLICY_HASH, sampleAgentExecutionRequest } from '../fixtures/index.js';
import { runAgentProviderContract } from './agent-provider-contract.js';

function requestFor(providerId: string): AgentExecutionRequest {
  return { ...sampleAgentExecutionRequest, providerId };
}

describe('MockAgentProvider satisfies the AgentProvider contract (v2)', () => {
  it('passes runAgentProviderContract including the resume path', async () => {
    await runAgentProviderContract(() => new MockAgentProvider(), requestFor('mock'), {
      resumeToken: 'fixture-resume-token',
    });
  });

  it('start() returns a handle; events replay in order with monotonic sequence', async () => {
    const provider = new MockAgentProvider();
    const handle = await provider.start(requestFor('mock'), AbortSignal.timeout(1000));
    expect(handle.executionId).toBe('exec-fixture-001');

    const events: Array<{ type: string; sequence: number; eventId: string; policyHash: string }> = [];
    const unsubscribe = handle.events((e) =>
      events.push({
        type: e.type,
        sequence: e.sequence,
        eventId: e.eventId,
        policyHash: e.policyHash,
      }),
    );
    const result = await handle.result();
    unsubscribe();

    expect(result.status).toBe('completed');
    expect(events.map((e) => e.type)).toEqual([
      'execution.started',
      'tool.requested',
      'tool.result',
      'execution.completed',
    ]);
    expect(events.map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
    // Every event echoes the request's policy snapshot hash (revision D).
    for (const e of events) {
      expect(e.policyHash).toBe(SAMPLE_POLICY_HASH);
    }
    // Event ids are unique per event.
    expect(new Set(events.map((e) => e.eventId)).size).toBe(4);
  });

  it('a late subscriber still receives the full buffered event history', async () => {
    const provider = new MockAgentProvider();
    const handle = await provider.start(requestFor('mock'), AbortSignal.timeout(1000));
    await handle.result(); // execution finished BEFORE subscribing
    const events: unknown[] = [];
    handle.events((e) => events.push(e));
    expect(events).toHaveLength(4);
  });

  it('events() returns a working unsubscribe function (no events after unsubscribe)', async () => {
    const provider = new MockAgentProvider({ delayMs: 100 });
    const handle = await provider.start(requestFor('mock'), AbortSignal.timeout(1000));
    const seen: unknown[] = [];
    // Subscribing replays the buffered history (documented mock behavior);
    // unsubscribing stops delivery of anything emitted afterwards.
    const unsubscribe = handle.events((e) => seen.push(e));
    const replayed = seen.length;
    unsubscribe();
    await handle.result();
    expect(seen).toHaveLength(replayed);
  });

  it('returns cancelled (never completed) when the signal is already aborted', async () => {
    const provider = new MockAgentProvider();
    const handle = await provider.start(requestFor('mock'), AbortSignal.abort());
    const res = await handle.result();
    expect(res.status).toBe('cancelled');
    expect(AgentExecutionResultSchema.safeParse(res).success).toBe(true);
  });

  it('returns cancelled when the signal aborts mid-execution (during delay)', async () => {
    const provider = new MockAgentProvider({ delayMs: 500 });
    const controller = new AbortController();
    const handlePromise = provider.start(requestFor('mock'), controller.signal);
    controller.abort();
    const handle = await handlePromise;
    const res = await handle.result();
    expect(res.status).toBe('cancelled');
  });

  it('resume() is addressed by (executionId, resumeToken) and never leaks the token', async () => {
    const provider = new MockAgentProvider();
    const handle = await provider.resume('exec-fixture-001', 'secret-resume-token');
    expect(handle.executionId).toBe('exec-fixture-001');

    const events: string[] = [];
    handle.events((e) => events.push(JSON.stringify(e)));
    const res = await handle.result();
    expect(res.status).toBe('completed');
    // The resumeToken is a credential: it must never appear in any event
    // or result payload (ADR-0020 §6).
    for (const serialized of events) {
      expect(serialized).not.toContain('secret-resume-token');
    }
    expect(JSON.stringify(res)).not.toContain('secret-resume-token');
  });

  it('capabilities() declares honest budget enforcement levels (revision C)', async () => {
    const provider = new MockAgentProvider();
    const caps = await provider.capabilities();
    expect(caps.capabilities.length).toBeGreaterThan(0);
    expect(caps.budgetEnforcement.maxDurationMs).toBe('gateway-enforced');
    // The mock has no cost information: cost is best-effort, never
    // claimed as enforced.
    expect(caps.budgetEnforcement.maxEstimatedCost).toBe('best-effort');
  });

  it('cancel() of an unknown executionId is a no-op', async () => {
    const provider = new MockAgentProvider();
    await expect(provider.cancel('never-existed')).resolves.toBeUndefined();
  });

  it('honors a configured failure status with a typed error', async () => {
    const provider = new MockAgentProvider({ status: 'timed_out' });
    const handle = await provider.start(requestFor('mock'), AbortSignal.timeout(1000));
    const res = await handle.result();
    expect(res.status).toBe('timed_out');
    // The mock builds a non-empty summary even for failures (contract: a
    // result must explain itself).
    expect(res.summary.length).toBeGreaterThan(0);
  });
});
