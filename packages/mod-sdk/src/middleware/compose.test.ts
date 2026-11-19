// packages/mod-sdk/src/middleware/compose.test.ts
import { describe, expect, it } from 'vitest';
import { compose } from './compose.js';
import type { Handler, ToolCallEvent, ModsApi } from '../types/events.js';

// A fake ModsApi that doesn't depend on MockRuntime, for direct compose tests.
const fakeApi: ModsApi = {
  ui: { log: () => {}, open: () => {}, resolve: () => {} },
  fs: { read: async () => '', write: async () => {} },
  state: { get: () => undefined, set: () => {} },
  http: {
    fetch: async () => {
      throw new Error('no');
    },
  },
};

describe('compose', () => {
  it('runs handlers in registration order and forwards through next', async () => {
    const calls: string[] = [];
    const h1: Handler<'tool.call'> = async ($, e, next) => {
      calls.push('h1-before');
      const r = await next(e);
      calls.push('h1-after');
      return r;
    };
    const h2: Handler<'tool.call'> = async ($, e, next) => {
      calls.push('h2-before');
      const r = await next(e);
      calls.push('h2-after');
      return r;
    };
    const terminal: Handler<'tool.call'> = async ($, e, next) => {
      calls.push('terminal');
      return next(e);
    };
    const composed = compose([h1, h2, terminal]);
    const result = await composed(
      fakeApi,
      { tool: 'Bash', input: {} } as ToolCallEvent,
      () => 'done',
    );
    expect(result).toBe('done');
    expect(calls).toEqual(['h1-before', 'h2-before', 'terminal', 'h2-after', 'h1-after']);
  });

  it('short-circuits when a handler answers without calling next', async () => {
    const calls: string[] = [];
    const h1: Handler<'tool.call'> = async ($, e, next) => {
      calls.push('h1');
      return next(e);
    };
    const h2: Handler<'tool.call'> = async () => {
      calls.push('h2-answer');
      return { deny: 'blocked by h2' };
    };
    const h3: Handler<'tool.call'> = async ($, e, next) => {
      calls.push('h3-should-not-run');
      return next(e);
    };
    const composed = compose([h1, h2, h3]);
    const result = await composed(
      fakeApi,
      { tool: 'Bash', input: {} } as ToolCallEvent,
      () => 'should-not-reach',
    );
    expect(result).toEqual({ deny: 'blocked by h2' });
    expect(calls).toEqual(['h1', 'h2-answer']);
  });
});
