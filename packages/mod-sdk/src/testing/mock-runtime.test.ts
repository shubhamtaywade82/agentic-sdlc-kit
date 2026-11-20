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

  it('drains streaming handlers (async function*) and uses their return value', async () => {
    const runtime = new MockRuntime();
    runtime.setHostResult({ usage: { input_tokens: 5 } });
    runtime.setHostChunks(['chunk-1', 'chunk-2']);
    // Streaming events (turn.step) take the generator form; the official
    // delegation is `const result = yield* next(e)`.
    const register: RegisterFn = (on) => {
      on('turn.step', async function* ($, _e, next) {
        $.ui.log('stream: before');
        const result = yield* next(_e);
        $.ui.log('stream: after');
        return result;
      });
    };
    runtime.load(register);
    const result = await runtime.fire('turn.step', { model: 'sonnet' });
    expect(result.forwarded).toBe(true);
    expect(result.value).toEqual({ usage: { input_tokens: 5 } });
    expect(result.chunks).toEqual(['chunk-1', 'chunk-2']);
    expect(runtime.getLogs()).toContain('stream: before');
    expect(runtime.getLogs()).toContain('stream: after');
  });

  it('captures a rewrite via next({ ...e, model }) on a streaming event', async () => {
    const runtime = new MockRuntime();
    const register: RegisterFn = (on) => {
      on('turn.step', async function* (_$, e, next) {
        return yield* next({ ...e, model: 'opus' });
      });
    };
    runtime.load(register);
    const result = await runtime.fire('turn.step', { model: 'sonnet' });
    expect(result.forwarded).toBe(true);
    expect(result.terminalEvent).toMatchObject({ model: 'opus' });
  });

  it('fires an event and forwards when no handler answers', async () => {
    const runtime = new MockRuntime();
    const register: RegisterFn = (on) => {
      on('tool.call', async (_, e, next) => next(e));
    };
    runtime.load(register);
    const result = await runtime.fire('tool.call', { tool: 'Bash' });
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
    const result = await runtime.fire('tool.call', { tool: 'Bash' });
    expect(result.answered).toBe(true);
    expect(result.value).toEqual({ deny: 'no' });
  });

  it('marks a forwarded host result as not answered, a rewritten result as answered', async () => {
    const runtime = new MockRuntime();
    runtime.setHostResult({ text: 'the host text' });
    const register: RegisterFn = (on) => {
      on('tool.call', async (_, _e, next) => next(_e));
      on('tool.check', async (_, _e, next) => {
        const r = (await next(_e)) as { text: string };
        return { ...r, text: r.text.toUpperCase() };
      });
    };
    runtime.load(register);
    const forwarded = await runtime.fire('tool.call', { tool: 'Bash' });
    expect(forwarded.forwarded).toBe(true);
    expect(forwarded.answered).toBe(false);
    expect(forwarded.value).toEqual({ text: 'the host text' });
    const rewritten = await runtime.fire('tool.check', { tool: 'Bash', input: {} });
    expect(rewritten.answered).toBe(true);
    expect(rewritten.value).toEqual({ text: 'THE HOST TEXT' });
  });

  it("respects the { tool: 'Bash' } matcher", async () => {
    const runtime = new MockRuntime();
    const register: RegisterFn = (on) => {
      on('tool.call', { tool: 'Bash' }, async () => {
        return { deny: 'bash blocked' };
      });
    };
    runtime.load(register);
    const bashResult = await runtime.fire('tool.call', { tool: 'Bash' });
    const editResult = await runtime.fire('tool.call', { tool: 'Edit' });
    expect(bashResult.answered).toBe(true);
    expect(editResult.answered).toBe(false);
  });

  it('respects array and RegExp matchers', async () => {
    const runtime = new MockRuntime();
    const register: RegisterFn = (on) => {
      on('tool.call', { tool: ['Edit', 'Write'] }, async () => ({ deny: 'file writes blocked' }));
      on('tool.call', { tool: /^mcp__github__/ }, async () => ({ deny: 'mcp blocked' }));
    };
    runtime.load(register);
    expect((await runtime.fire('tool.call', { tool: 'Write' })).answered).toBe(true);
    expect((await runtime.fire('tool.call', { tool: 'Edit' })).answered).toBe(true);
    expect((await runtime.fire('tool.call', { tool: 'Read' })).answered).toBe(false);
    expect((await runtime.fire('tool.call', { tool: 'mcp__github__create_issue' })).answered).toBe(
      true,
    );
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
    await runtime.fire('tool.call', { tool: 'Bash' });
    expect(runtime.getLogs()).toContain('hello from handler');
  });

  it('supports $.state.get and $.state.set', async () => {
    const runtime = new MockRuntime();
    const register: RegisterFn = (on) => {
      on('tool.call', async ($, e, next) => {
        $.state.set({ plugin: 'test-mod', key: 'greeting' }, 'value');
        const v = $.state.get<string>({ plugin: 'test-mod', key: 'greeting' });
        $.ui.log(`got ${v ?? '<missing>'}`);
        return next(e);
      });
    };
    runtime.load(register);
    await runtime.fire('tool.call', { tool: 'Bash' });
    expect(runtime.getLogs()).toContain('got value');
    expect(runtime.getState<string>({ plugin: 'test-mod', key: 'greeting' })).toBe('value');
  });

  it('runs the chained .catch handler when the hook throws (fail-closed)', async () => {
    const runtime = new MockRuntime();
    const register: RegisterFn = (on) => {
      on('tool.call', { tool: 'Bash' }, async () => {
        throw new Error('hook exploded');
      }).catch(() => ({ deny: 'fail closed' }));
    };
    runtime.load(register);
    const result = await runtime.fire('tool.call', { tool: 'Bash' });
    expect(result.answered).toBe(true);
    expect(result.value).toEqual({ deny: 'fail closed' });
  });

  it('skips a throwing hook that has no .catch (host behavior)', async () => {
    const runtime = new MockRuntime();
    const register: RegisterFn = (on) => {
      on('tool.call', { tool: 'Bash' }, async () => {
        throw new Error('hook exploded');
      });
    };
    runtime.load(register);
    const result = await runtime.fire('tool.call', { tool: 'Bash' });
    expect(result.forwarded).toBe(true);
    expect(result.answered).toBe(false);
  });

  it('mocks $.ui.ask: resolves queued answers, rejects when nobody can answer', async () => {
    const runtime = new MockRuntime();
    runtime.queueAskAnswers('Run it');
    const register: RegisterFn = (on) => {
      on('tool.call', { tool: 'Bash' }, async ($, _e, next) => {
        let answer = 'Refuse';
        try {
          answer = await $.ui.ask('run?', ['Run it', 'Refuse']);
        } catch {
          // nobody to ask
        }
        return answer === 'Run it' ? next(_e) : { deny: 'refused' };
      });
    };
    runtime.load(register);
    const approved = await runtime.fire('tool.call', { tool: 'Bash' });
    expect(approved.forwarded).toBe(true);
    const refused = await runtime.fire('tool.call', { tool: 'Bash' });
    expect(refused.answered).toBe(true);
    expect((refused.value as { deny: string }).deny).toBe('refused');
  });

  it('mocks $.process.run with queued results and records calls', async () => {
    const runtime = new MockRuntime();
    runtime.queueProcessResults({ stdout: 'diff --cached contents', exitCode: 0 });
    const register: RegisterFn = (on) => {
      on('tool.call', { tool: 'Bash' }, async ($, _e, next) => {
        const r = await $.process.run(['git', 'diff', '--cached']);
        return r.exitCode === 0 ? next(_e) : { deny: 'git failed' };
      });
    };
    runtime.load(register);
    const ok = await runtime.fire('tool.call', { tool: 'Bash' });
    expect(ok.forwarded).toBe(true);
    expect(runtime.getProcessCalls()).toEqual([['git', 'diff', '--cached']]);
    // No result queued anymore: $.process.run throws inside the hook. With
    // no chained .catch the host SKIPS the hook — the call goes through.
    const skipped = await runtime.fire('tool.call', { tool: 'Bash' });
    expect(skipped.forwarded).toBe(true);
    expect(skipped.answered).toBe(false);
  });

  it('mocks $.clock.now and $.session.id', async () => {
    const runtime = new MockRuntime(1_000_000);
    runtime.setSession('S-42', '/repo');
    const register: RegisterFn = (on) => {
      on('session.start', async ($, _e, next) => {
        $.ui.log(`t=${$.clock.now()} s=${$.session.id()} cwd=${$.session.cwd()}`);
        return next(_e);
      });
    };
    runtime.load(register);
    await runtime.fire('session.start', {});
    expect(runtime.getLogs()).toContain('t=1000000 s=S-42 cwd=/repo');
    runtime.advanceClock(2_500);
    await runtime.fire('session.start', {});
    expect(runtime.getLogs()).toContain('t=1002500 s=S-42 cwd=/repo');
  });

  it('mocks $.fs.exists / $.fs.list / $.command.register / $.ui.status', async () => {
    const runtime = new MockRuntime();
    runtime.setListing('.ai/reports/runs', ['run-1.jsonl']);
    const register: RegisterFn = (on) => {
      on('session.start', async ($, e, next) => {
        await $.command.register({ name: 'kit-status', description: 'status' });
        const listed = await $.fs.list('.ai/reports/runs');
        const exists = await $.fs.exists('.ai/reports/runs');
        $.ui.status(`files=${listed.length} exists=${exists}`);
        return next(e);
      });
    };
    runtime.load(register);
    await runtime.fire('session.start', {});
    expect(runtime.getRegisteredCommands()).toEqual([
      { name: 'kit-status', description: 'status' },
    ]);
    expect(runtime.getStatuses()).toContain('files=1 exists=true');
  });
});
