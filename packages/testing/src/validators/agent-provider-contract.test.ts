// packages/testing/src/validators/agent-provider-contract.test.ts
//
// Runs the reusable AgentProvider contract harness against the in-package
// MockAgentProvider. This proves the harness and the mock agree on the M36
// contract. Real provider packages (provider-claude-code, etc.) will run
// the same harness against their own adapter.

import { describe, expect, it } from 'vitest';
import {
  AgentExecutionResultSchema,
  type AgentExecutionRequest,
} from '@agentic-sdlc-kit/contracts';
import { MockAgentProvider, sampleAgentExecutionRequest } from '../fixtures/index.js';
import { runAgentProviderContract } from './agent-provider-contract.js';

function requestFor(providerId: string): AgentExecutionRequest {
  return { ...sampleAgentExecutionRequest, providerId };
}

describe('MockAgentProvider satisfies the AgentProvider contract', () => {
  it('passes runAgentProviderContract', async () => {
    await runAgentProviderContract(() => new MockAgentProvider(), requestFor('mock'));
  });

  it('emits execution.started before execution.completed, with monotonic seq', async () => {
    const provider = new MockAgentProvider();
    const events: Array<{ type: string; seq: number }> = [];
    const res = await provider.execute(requestFor('mock'), AbortSignal.timeout(1000), (e) =>
      events.push({ type: e.type, seq: e.seq }),
    );
    expect(res.status).toBe('completed');
    expect(events.map((e) => e.type)).toEqual([
      'execution.started',
      'tool.requested',
      'tool.result',
      'execution.completed',
    ]);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('returns cancelled (never completed) when the signal is already aborted', async () => {
    const provider = new MockAgentProvider();
    const res = await provider.execute(requestFor('mock'), AbortSignal.abort());
    expect(res.status).toBe('cancelled');
    expect(AgentExecutionResultSchema.safeParse(res).success).toBe(true);
  });

  it('returns cancelled when the signal aborts mid-execution (during delay)', async () => {
    const provider = new MockAgentProvider({ delayMs: 500 });
    const controller = new AbortController();
    const promise = provider.execute(requestFor('mock'), controller.signal);
    controller.abort();
    const res = await promise;
    expect(res.status).toBe('cancelled');
  });

  it('cancel() of an unknown executionId is a no-op', async () => {
    const provider = new MockAgentProvider();
    await expect(provider.cancel('never-existed')).resolves.toBeUndefined();
  });

  it('honors a configured failure status with a typed error', async () => {
    const provider = new MockAgentProvider({ status: 'timed_out' });
    const res = await provider.execute(requestFor('mock'), AbortSignal.timeout(1000));
    expect(res.status).toBe('timed_out');
    // The mock builds a non-empty summary even for failures (contract: a
    // result must explain itself).
    expect(res.summary.length).toBeGreaterThan(0);
  });
});
