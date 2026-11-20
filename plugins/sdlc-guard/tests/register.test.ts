// plugins/sdlc-guard/tests/register.test.ts
//
// Behavioral tests against the MockRuntime, which mirrors the REAL host
// contract: tool.call carries the command as e.command; tool.check carries
// it under e.input.command and answers { decision, reason? }; $.ui.ask
// resolves queued answers (and rejects when nobody can answer — the hook
// must treat that as a refusal); .catch handlers run when a hook throws.
import { describe, expect, it } from 'vitest';
import { MockRuntime } from '@agentic-sdlc-kit/mod-sdk';
import { register } from '../hooks/register';

describe('sdlc-guard register', () => {
  it('registers one Bash handler each for tool.call and tool.check', () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    expect(runtime.registrationCount('tool.call')).toBe(1);
    expect(runtime.registrationCount('tool.check')).toBe(1);
  });

  it('asks the user for a force-push in interactive mode and forwards on approval', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    runtime.queueAskAnswers('Run it');
    const result = await runtime.fire('tool.call', {
      tool: 'Bash',
      command: 'git push origin main --force',
    });
    expect(result.forwarded).toBe(true);
    expect(result.answered).toBe(false);
    expect(runtime.getLogs().some((l) => l.includes('user approved'))).toBe(true);
  });

  it('refuses a force-push when the user refuses (or nobody answers)', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    // No queued answer: $.ui.ask rejects (dismissed / headless) → Refuse.
    const result = await runtime.fire('tool.call', {
      tool: 'Bash',
      command: 'git push origin main --force',
    });
    expect(result.answered).toBe(true);
    const value = result.value as { deny?: string };
    expect(value.deny).toMatch(/sdlc-guard/);
    expect(runtime.getLogs().some((l) => l.includes('user refused'))).toBe(true);
  });

  it('DENIES a force-push in non-interactive mode (fail-closed, no ask)', async () => {
    const runtime = new MockRuntime();
    runtime.setState({ plugin: 'sdlc-guard', key: 'context' }, { interactive: false });
    runtime.load(register);
    const result = await runtime.fire('tool.call', {
      tool: 'Bash',
      command: 'git push origin main --force',
    });
    expect(result.answered).toBe(true);
    const value = result.value as { deny?: string };
    expect(value.deny).toMatch(/sdlc-guard/);
    expect(value.deny).toMatch(/fail-closed/);
    // Non-interactive deny never asks: no approval log, no queued answer consumed.
    expect(runtime.getLogs().some((l) => l.includes('approval required'))).toBe(false);
  });

  it("returns { decision: 'ask' } for a force-push via tool.check", async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const result = await runtime.fire('tool.check', {
      tool: 'Bash',
      input: { command: 'git push origin main --force' },
    });
    expect(result.answered).toBe(true);
    const value = result.value as { decision?: string; reason?: string };
    expect(value.decision).toBe('ask');
    expect(value.reason).toMatch(/sdlc-guard/);
  });

  it("DENIES via tool.check with { decision: 'deny' } in non-interactive mode", async () => {
    const runtime = new MockRuntime();
    runtime.setState({ plugin: 'sdlc-guard', key: 'context' }, { interactive: false });
    runtime.load(register);
    const result = await runtime.fire('tool.check', {
      tool: 'Bash',
      input: { command: 'git push origin main --force' },
    });
    expect(result.answered).toBe(true);
    const value = result.value as { decision?: string };
    expect(value.decision).toBe('deny');
  });

  it('forwards a safe command via tool.call without asking', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const result = await runtime.fire('tool.call', {
      tool: 'Bash',
      command: 'ls -la',
    });
    expect(result.forwarded).toBe(true);
    expect(result.answered).toBe(false);
    expect(runtime.getLogs()).toEqual([]);
  });

  it('forwards non-Bash tools without inspection', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const result = await runtime.fire('tool.call', {
      tool: 'Read',
      file_path: 'README.md',
    });
    expect(result.forwarded).toBe(true);
    expect(result.answered).toBe(false);
  });

  it('asks before other destructive classes (rm -rf, db:migrate, deploy)', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    for (const command of [
      'rm -rf ./build',
      'rails db:migrate',
      'kubectl apply -f prod.yaml',
    ]) {
      runtime.queueAskAnswers('Refuse');
      const result = await runtime.fire('tool.call', { tool: 'Bash', command });
      expect(result.answered).toBe(true);
      expect((result.value as { deny?: string }).deny).toMatch(/sdlc-guard/);
    }
  });

  it('fails CLOSED via .catch when the hook errors (timeout/throw)', async () => {
    const runtime = new MockRuntime();
    // Poison the state key the hook reads: $.state.get throws inside the
    // hook, and the chained .catch must turn that into a refusal.
    runtime.poisonState('sdlc-guard', 'context');
    runtime.load(register);
    const call = await runtime.fire('tool.call', {
      tool: 'Bash',
      command: 'git push origin main --force',
    });
    expect(call.answered).toBe(true);
    expect((call.value as { deny?: string }).deny).toMatch(/fail closed/);
    const check = await runtime.fire('tool.check', {
      tool: 'Bash',
      input: { command: 'git push origin main --force' },
    });
    expect(check.answered).toBe(true);
    expect(check.value).toMatchObject({ decision: 'deny' });
  });
});
