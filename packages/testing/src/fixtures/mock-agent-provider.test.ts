// packages/testing/src/fixtures/mock-agent-provider.test.ts
//
// Focused tests for MockAgentProvider options added for orchestration
// (PR3): the performWork hook (simulated agent work in the workspace)
// and resumePolicyHash. The general contract shape is covered by
// src/validators/agent-provider-contract.test.ts; these tests cover the
// levers orchestration integration tests pull.

import { describe, expect, it } from 'vitest';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  AgentExecutionRequestSchema,
  type AgentExecutionEvent,
} from '@agentic-sdlc-kit/contracts';
import { sampleAgentExecutionRequest } from './agent-execution.js';
import { MockAgentProvider } from './mock-agent-provider.js';

const REQUEST = AgentExecutionRequestSchema.parse(sampleAgentExecutionRequest);

describe('MockAgentProvider performWork', () => {
  it('runs the hook on the completion path and passes the full request', async () => {
    const seen: string[] = [];
    const provider = new MockAgentProvider({
      performWork: (request) => {
        seen.push(request.taskId, request.workspace.rootPath);
      },
    });
    const handle = await provider.start(REQUEST, new AbortController().signal);
    const result = await handle.result();
    expect(result.status).toBe('completed');
    expect(seen).toEqual([REQUEST.taskId, REQUEST.workspace.rootPath]);
  });

  it('does not run the hook when the signal is already aborted', async () => {
    let ran = false;
    const provider = new MockAgentProvider({
      performWork: () => {
        ran = true;
      },
    });
    const controller = new AbortController();
    controller.abort();
    const handle = await provider.start(REQUEST, controller.signal);
    const result = await handle.result();
    expect(result.status).toBe('cancelled');
    expect(ran).toBe(false);
  });

  it('ends failed with a PROVIDER_INTERNAL error when the hook throws', async () => {
    const provider = new MockAgentProvider({
      performWork: () => {
        throw new Error('workspace exploded');
      },
    });
    const handle = await provider.start(REQUEST, new AbortController().signal);
    const result = await handle.result();
    expect(result.status).toBe('failed');
    expect(result.errors[0]?.code).toBe('PROVIDER_INTERNAL');
    expect(result.errors[0]?.message).toContain('workspace exploded');
  });

  it('a failed hook still emits an execution.completed event with status failed', async () => {
    const provider = new MockAgentProvider({
      performWork: () => {
        throw new Error('boom');
      },
    });
    const handle = await provider.start(REQUEST, new AbortController().signal);
    const events: AgentExecutionEvent[] = [];
    handle.events((e) => events.push(e));
    await handle.result();
    const last = events[events.length - 1];
    expect(last?.type).toBe('execution.completed');
    expect(last?.type === 'execution.completed' && last.status).toBe('failed');
  });

  it('is not invoked on the resume() path (no original request exists)', async () => {
    let ran = false;
    const provider = new MockAgentProvider({
      performWork: () => {
        ran = true;
      },
    });
    const handle = await provider.resume('exec-fixture-001', 'secret-token');
    const result = await handle.result();
    expect(result.status).toBe('completed');
    expect(ran).toBe(false);
    expect(provider.wasResumedWith('exec-fixture-001')).toBe('secret-token');
  });
});

describe('MockAgentProvider resumePolicyHash', () => {
  it('echoes the configured hash in resume events', async () => {
    const provider = new MockAgentProvider({
      resumePolicyHash: 'sha256:real-policy-abc',
    });
    const handle = await provider.resume('exec-fixture-001', 'secret-token');
    const events: AgentExecutionEvent[] = [];
    handle.events((e) => events.push(e));
    await handle.result();
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.policyHash).toBe('sha256:real-policy-abc');
      expect(e.schemaVersion).toBe(AGENT_EVENT_SCHEMA_VERSION);
    }
  });

  it('defaults to the synthetic fixture hash (contract-harness compatibility)', async () => {
    const provider = new MockAgentProvider();
    const handle = await provider.resume('exec-fixture-001', 'secret-token');
    const events: AgentExecutionEvent[] = [];
    handle.events((e) => events.push(e));
    await handle.result();
    expect(events[0]?.policyHash).toBe('sha256:mock-resume-policy');
  });

  it('never places the resume token in events or results', async () => {
    const provider = new MockAgentProvider();
    const handle = await provider.resume('exec-fixture-001', 'tok-DO-NOT-LEAK');
    const events: AgentExecutionEvent[] = [];
    handle.events((e) => events.push(e));
    const result = await handle.result();
    const serialized = JSON.stringify({ events, result });
    expect(serialized).not.toContain('tok-DO-NOT-LEAK');
  });
});
