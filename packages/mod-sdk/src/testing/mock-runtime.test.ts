// packages/mod-sdk/src/testing/mock-runtime.test.ts
import { describe, expect, it } from 'vitest';
import { MockRuntime } from './mock-runtime.js';
import type { RegisterFn, ToolCallEvent } from '../types/events.js';

describe('MockRuntime', () => {
  it('captures registrations from a register function', () => {
    const runtime = new MockRuntime();
    const register: RegisterFn = (on) => {
      on('tool.call', async (_, e, next) => next(e));
      on('tool.check', async (_, e, next) => next(e));
    };
    runtime.load(register);
    expect(runtime.registrationCount()).toBe(2);
    expect(runtime.registrationCount('tool.call')).toBe(1);
  });

  it('fires an event and forwards when no handler answers', async () => {
    const runtime = new MockRuntime();
    const register: RegisterFn = (on) => {
      on('tool.call', async (_, e, next) => next(e));
    };
    runtime.load(register);
    const result = await runtime.fire('tool.call', { tool: 'Bash', input: {} } as ToolCallEvent);
    expect(result.answered).toBe(false);
    expect(result.forwarded).toBe(true);
  });

  it('fires an event and captures a deny answer', async () => {
    const runtime = new MockRuntime();
    const register: RegisterFn = (on) => {
      on('tool.call', async (_, e: ToolCallEvent, next) => {
        if (e.tool === 'Bash') return { deny: 'no' };
        return next(e);
      });
    };
    runtime.load(register);
    const result = await runtime.fire('tool.call', { tool: 'Bash', input: {} } as ToolCallEvent);
    expect(result.answered).toBe(true);
    expect(result.value).toEqual({ deny: 'no' });
  });

  it("respects the { tool: 'Bash' } matcher", async () => {
    const runtime = new MockRuntime();
    const register: RegisterFn = (on) => {
      on('tool.call', { tool: 'Bash' }, async () => {
        return { deny: 'bash blocked' };
      });
    };
    runtime.load(register);
    const bashResult = await runtime.fire('tool.call', { tool: 'Bash', input: {} });
    const editResult = await runtime.fire('tool.call', { tool: 'Edit', input: {} });
    expect(bashResult.answered).toBe(true);
    expect(editResult.answered).toBe(false);
  });

  it('captures $.ui.log calls', async () => {
    const runtime = new MockRuntime();
    const register: RegisterFn = (on) => {
      on('tool.call', async ($, e, next) => {
        $.ui.log('hello from handler');
        return next(e);
      });
    };
    runtime.load(register);
    await runtime.fire('tool.call', { tool: 'Bash', input: {} });
    expect(runtime.getLogs()).toContain('hello from handler');
  });

  it('supports $.state.get and $.state.set', async () => {
    const runtime = new MockRuntime();
    const register: RegisterFn = (on) => {
      on('tool.call', async ($, e, next) => {
        $.state.set('key', 'value');
        const v = $.state.get<string>('key');
        $.ui.log(`got ${v ?? '<missing>'}`);
        return next(e);
      });
    };
    runtime.load(register);
    await runtime.fire('tool.call', { tool: 'Bash', input: {} });
    expect(runtime.getLogs()).toContain('got value');
    expect(runtime.getState<string>('key')).toBe('value');
  });
});
