// plugins/model-router/tests/register.test.ts
//
// Behavioral tests against the MockRuntime, which mirrors the REAL host
// contract: turn.step streams (its next is an async generator; delegation
// is `yield* next(e)`); agent.spawn rewrites via next({ ...e, model }) and
// skips resumed runs (e.resume).
import { describe, expect, it } from 'vitest';
import { MockRuntime } from '@agentic-sdlc-kit/mod-sdk';
import { register } from '../hooks/register';
import type { RoutingPolicy } from '../policies/types';

const APPLY_POLICY: RoutingPolicy = {
  schemaVersion: 1,
  id: 'apply',
  version: '1.0.0',
  rules: [
    {
      id: 'R-routing',
      taskType: '*',
      complexity: 'medium',
      risk: 'low',
      model: 'sonnet',
      effort: 'medium',
      verification: 'tests',
      reason: 'routine engineering',
    },
  ],
  defaultModel: 'sonnet',
  defaultEffort: 'medium',
  suggestOnly: false,
};

describe('model-router register', () => {
  it('registers handlers for turn.step and agent.spawn', () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    expect(runtime.registrationCount('turn.step')).toBe(1);
    expect(runtime.registrationCount('agent.spawn')).toBe(1);
  });

  it('forwards the stream unchanged in suggest-only mode (default)', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    runtime.setHostResult({ usage: { input_tokens: 10, output_tokens: 5 }, model: 'sonnet' });
    runtime.setHostChunks(['chunk-a', 'chunk-b']);
    const result = await runtime.fire('turn.step', { model: 'sonnet', effort: 'medium' });
    // The stream went through: chunks forwarded, result preserved.
    expect(result.forwarded).toBe(true);
    expect(result.value).toEqual({ usage: { input_tokens: 10, output_tokens: 5 }, model: 'sonnet' });
    expect(result.chunks).toEqual(['chunk-a', 'chunk-b']);
    // The event reached the host unmodified.
    expect(result.terminalEvent).toEqual({ model: 'sonnet', effort: 'medium' });
    expect(runtime.getLogs().some((l) => l.includes('model-router: suggest'))).toBe(true);
  });

  it('rewrites the model via yield* next({ ...e, model }) in apply mode', async () => {
    const runtime = new MockRuntime();
    runtime.setState({ plugin: 'model-router', key: 'policy' }, APPLY_POLICY);
    runtime.load(register);
    runtime.setHostResult({ model: 'sonnet' });
    const result = await runtime.fire('turn.step', { model: 'haiku', effort: 'low' });
    expect(result.forwarded).toBe(true);
    expect(result.terminalEvent).toMatchObject({ model: 'sonnet', effort: 'medium' });
    expect(runtime.getLogs().some((l) => l.includes('model-router: apply'))).toBe(true);
  });

  it('preserves an explicit subagent model', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    await runtime.fire('agent.spawn', { name: 'researcher', model: 'haiku' });
    expect(runtime.getLogs().some((l) => l.includes('keeps explicit model haiku'))).toBe(true);
  });

  it('skips resumed subagent runs (changes are ignored by the host)', async () => {
    const runtime = new MockRuntime();
    runtime.setState({ plugin: 'model-router', key: 'policy' }, APPLY_POLICY);
    runtime.load(register);
    const result = await runtime.fire('agent.spawn', { name: 'researcher', resume: true });
    expect(result.forwarded).toBe(true);
    expect(result.terminalEvent).toEqual({ name: 'researcher', resume: true });
    expect(runtime.getLogs().some((l) => l.includes('model-router:'))).toBe(false);
  });

  it('suggests (not applies) for a subagent without a model by default', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const result = await runtime.fire('agent.spawn', { name: 'code-reviewer' });
    expect(result.forwarded).toBe(true);
    expect(result.terminalEvent).toEqual({ name: 'code-reviewer' });
    expect(runtime.getLogs().some((l) => l.includes('model-router: suggest subagent'))).toBe(true);
  });

  it('applies a model to a fresh subagent spawn in apply mode', async () => {
    const runtime = new MockRuntime();
    runtime.setState({ plugin: 'model-router', key: 'policy' }, APPLY_POLICY);
    runtime.load(register);
    const result = await runtime.fire('agent.spawn', { name: 'code-reviewer' });
    expect(result.forwarded).toBe(true);
    expect(result.terminalEvent).toMatchObject({ name: 'code-reviewer', model: 'sonnet' });
  });
});
