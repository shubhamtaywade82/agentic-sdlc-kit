// plugins/model-router/tests/register.test.ts
import { describe, expect, it } from 'vitest';
import { MockRuntime } from '@agentic-sdlc-kit/mod-sdk';
import { register } from '../hooks/register.js';

describe('model-router register', () => {
  it('registers handlers for turn.step and agent.spawn', () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    expect(runtime.registrationCount('turn.step')).toBe(1);
    expect(runtime.registrationCount('agent.spawn')).toBe(1);
  });

  it('logs a suggestion in suggest-only mode (default)', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    await runtime.fire('turn.step', { model: 'sonnet', effort: 'medium' });
    const logs = runtime.getLogs();
    expect(logs.some((l) => l.includes('model-router: suggest'))).toBe(true);
  });

  it('preserves an explicit subagent model', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    await runtime.fire('agent.spawn', {
      name: 'researcher',
      model: 'haiku',
    });
    const logs = runtime.getLogs();
    expect(logs.some((l) => l.includes('keeps explicit model haiku'))).toBe(true);
  });
});
