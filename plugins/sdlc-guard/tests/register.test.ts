// plugins/sdlc-guard/tests/register.test.ts
import { describe, expect, it } from 'vitest';
import { MockRuntime } from '@agentic-sdlc-kit/mod-sdk';
import { register } from '../hooks/register.js';
import type { PolicyContext } from '@agentic-sdlc-kit/contracts';

describe('sdlc-guard register', () => {
  it('registers handlers for tool.call and tool.check', () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    expect(runtime.registrationCount('tool.call')).toBeGreaterThanOrEqual(1);
    expect(runtime.registrationCount('tool.check')).toBeGreaterThanOrEqual(1);
  });

  it('forwards a force-push in interactive mode (require-approval → ask the host)', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const result = await runtime.fire('tool.call', {
      tool: 'Bash',
      input: { command: 'git push origin main --force' },
    });
    // M10 baseline: destructive action in interactive mode → require-approval.
    // The register function forwards to next(e) so the host can ask the user.
    expect(result.forwarded).toBe(true);
    expect(result.answered).toBe(false);
    // The Mod should have logged that approval is required.
    expect(runtime.getLogs().some((l) => l.includes('approval required'))).toBe(true);
  });

  it('DENIES a force-push in non-interactive mode (fail-closed)', async () => {
    const runtime = new MockRuntime();
    // Set non-interactive context.
    const ctx: PolicyContext = { interactive: false };
    runtime.api.state.set('sdlc-guard.context', ctx);
    runtime.load(register);
    const result = await runtime.fire('tool.call', {
      tool: 'Bash',
      input: { command: 'git push origin main --force' },
    });
    expect(result.answered).toBe(true);
    const value = result.value as { deny?: string };
    expect(value.deny).toMatch(/sdlc-guard/);
  });

  it("returns 'ask' for a force-push via tool.check (require-approval)", async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const result = await runtime.fire('tool.check', {
      tool: 'Bash',
      input: { command: 'git push origin main --force' },
    });
    expect(result.answered).toBe(true);
    expect(result.value).toBe('ask');
  });

  it('DENIES via tool.check in non-interactive mode', async () => {
    const runtime = new MockRuntime();
    const ctx: PolicyContext = { interactive: false };
    runtime.api.state.set('sdlc-guard.context', ctx);
    runtime.load(register);
    const result = await runtime.fire('tool.check', {
      tool: 'Bash',
      input: { command: 'git push origin main --force' },
    });
    expect(result.answered).toBe(true);
    expect(result.value).toBe('deny');
  });

  it('forwards a safe command via tool.call', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const result = await runtime.fire('tool.call', {
      tool: 'Bash',
      input: { command: 'ls -la' },
    });
    expect(result.forwarded).toBe(true);
    expect(result.answered).toBe(false);
  });

  it('forwards non-Bash tools without inspection', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const result = await runtime.fire('tool.call', {
      tool: 'Read',
      input: { path: '/some/file' },
    });
    expect(result.forwarded).toBe(true);
  });
});
