// plugins/secret-guard/tests/register.test.ts
import { describe, expect, it } from 'vitest';
import { MockRuntime } from '@agentic-sdlc-kit/mod-sdk';
import { register } from '../hooks/register.js';

describe('secret-guard register', () => {
  it('registers handlers for tool.call', () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    expect(runtime.registrationCount('tool.call')).toBeGreaterThanOrEqual(1);
  });

  it('denies a Write of a file containing an AWS access key', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const result = await runtime.fire('tool.call', {
      tool: 'Write',
      input: {
        path: 'config.env',
        content: 'AWS_KEY=AKIAIOSFODNN7EXAMPLE\n',
      },
    });
    expect(result.answered).toBe(true);
    const value = result.value as { deny?: string };
    expect(value.deny).toMatch(/secret-guard/);
  });

  it('forwards a Write of clean content', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const result = await runtime.fire('tool.call', {
      tool: 'Write',
      input: {
        path: 'README.md',
        content: '# Hello world\nThis is a normal file.\n',
      },
    });
    // The Write handler forwards; the catch-all tool.call handler then
    // tries to redact the result (which is undefined since next returns
    // undefined in the mock).
    expect(result.answered).toBe(false);
  });

  it('logs when scanning a git commit operation', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    await runtime.fire('tool.call', {
      tool: 'Bash',
      input: { command: "git commit -m 'release v1.0.0'" },
    });
    expect(runtime.getLogs().some((l) => l.includes('scanning staged changes'))).toBe(true);
  });

  it('does NOT log scanning for a non-git Bash command', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    await runtime.fire('tool.call', {
      tool: 'Bash',
      input: { command: 'ls -la' },
    });
    expect(runtime.getLogs().some((l) => l.includes('scanning'))).toBe(false);
  });
});
