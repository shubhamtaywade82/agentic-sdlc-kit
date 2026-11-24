// plugins/sdlc-guard/tests/mods-together.test.ts
//
// The four Mods loaded into ONE runtime, the way a user installs them. Each
// plugin has its own tests; this file checks what only shows up when they
// share a chain: ordering, one plugin failing while another must still guard,
// and whether one plugin's telemetry can leak what another redacts.
//
// It lives here (the governance plugin) because plugin tests/ are not scanned
// by scripts/check-architecture.ts and are excluded from each plugin's tsc, so
// importing the sibling plugins by relative path adds no workspace dependency
// and does not make mod-sdk depend on plugins. The hooks modules themselves
// still import only their own files. Every plugin's vitest config aliases
// 'claude-code' to the same shim, so all four run on an identical runtime.
import { describe, expect, it } from 'vitest';
import { MockRuntime } from '@agentic-sdlc-kit/mod-sdk';
import { register as sdlcGuard } from '../hooks/register';
import { register as secretGuard } from '../../secret-guard/hooks/register';
import { register as modelRouter } from '../../model-router/hooks/register';
import { register as runObserver } from '../../run-observer/hooks/register';
import { DEFAULT_REDACTION_POLICY } from '../../secret-guard/policies/detect';
import { DEFAULT_POLICY } from '../../model-router/policies/default-policy';

// Fake credential shapes; none is a real key.
const AWS_KEY = 'AKIAIOSFODNNN7EXAMPLE';

type Mod = 'sdlc-guard' | 'secret-guard' | 'model-router' | 'run-observer';
const REGISTER = { 'sdlc-guard': sdlcGuard, 'secret-guard': secretGuard, 'model-router': modelRouter, 'run-observer': runObserver };

const GUARDS_FIRST: Mod[] = ['sdlc-guard', 'secret-guard', 'model-router', 'run-observer'];
const OBSERVER_FIRST: Mod[] = ['run-observer', 'model-router', 'secret-guard', 'sdlc-guard'];

function load(order: Mod[] = GUARDS_FIRST): MockRuntime {
  const runtime = new MockRuntime();
  for (const name of order) runtime.load(REGISTER[name]);
  return runtime;
}

const deny = (r: { value: unknown }): string | undefined => (r.value as { deny?: string } | undefined)?.deny;
const bash = (runtime: MockRuntime, command: string) => runtime.fire('tool.call', { tool: 'Bash', command });

describe('four Mods in one runtime', () => {
  it('registers every plugin hook without any plugin disturbing another', () => {
    const runtime = load();
    // sdlc-guard 1 + secret-guard 1 + run-observer 1 (+ secret-guard's 3 gates) on tool.call
    expect(runtime.registrationCount('tool.call')).toBeGreaterThanOrEqual(6);
    expect(runtime.registrationCount('turn.step')).toBe(2); // model-router + run-observer
    expect(runtime.registrationCount('agent.spawn')).toBe(1);
  });

  describe.each([
    ['guards registered first', GUARDS_FIRST],
    ['observer registered first', OBSERVER_FIRST],
  ])('safety does not depend on load order (%s)', (_label, order) => {
    it('a destructive command is refused when nobody can approve it', async () => {
      const runtime = load(order);
      const result = await bash(runtime, 'rm -rf build');
      expect(deny(result)).toMatch(/declined by the user|refus/i);
      expect(result.forwarded).toBe(false);
    });

    it('a destructive command runs only when the user approves', async () => {
      const runtime = load(order);
      runtime.queueAskAnswers('Run it');
      const result = await bash(runtime, 'rm -rf build');
      expect(deny(result)).toBeUndefined();
      expect(result.forwarded).toBe(true);
    });

    it('a Write containing a credential is denied', async () => {
      const runtime = load(order);
      const result = await runtime.fire('tool.call', {
        tool: 'Write',
        file_path: 'config.env',
        content: `AWS_KEY=${AWS_KEY}\n`,
      });
      expect(deny(result)).toMatch(/aws-access-key/);
      expect(result.forwarded).toBe(false);
    });

    it('a credential in tool output is redacted before the model sees it', async () => {
      const runtime = load(order);
      runtime.setHostResult({ text: `creds: ${AWS_KEY}\n` });
      const result = await bash(runtime, 'cat notes.txt');
      const text = (result.value as { text?: string }).text ?? '';
      expect(text).not.toContain(AWS_KEY);
      expect(text).toMatch(/REDACTED/);
    });

    it('tool output too large to scan is withheld, never passed through', async () => {
      const runtime = load(order);
      runtime.setState({ plugin: 'secret-guard', key: 'policy' }, { ...DEFAULT_REDACTION_POLICY, maxInputChars: 64 });
      runtime.setHostResult({ text: 'filler '.repeat(40) + AWS_KEY });
      const result = await bash(runtime, 'cat huge.log');
      const text = (result.value as { text?: string }).text ?? '';
      expect(text).not.toContain(AWS_KEY);
      expect(text).toMatch(/WITHHELD/);
    });

    it('a commit with a credential staged is denied', async () => {
      const runtime = load(order);
      runtime.queueProcessResults({ stdout: `+k = "${AWS_KEY}"\n` });
      const result = await bash(runtime, 'git commit -m "add config"');
      expect(deny(result)).toMatch(/staged changes contain/);
    });

    it('a commit with a repository redirect (-C) is denied before a scan can inspect the wrong repo', async () => {
      const runtime = load(order);
      const result = await bash(runtime, 'git -C sub commit -m "add config"');
      expect(deny(result)).toMatch(/repository context or push target scope cannot be verified/);
      expect(runtime.getProcessCalls()).toEqual([]);
    });

    it('a supported push is denied when local commit history contains a credential', async () => {
      const runtime = load(order);
      runtime.queueProcessResults({ stdout: `+k = "${AWS_KEY}"\n` });
      const result = await bash(runtime, 'git push origin');
      expect(deny(result)).toMatch(/locally reachable commit history contain/);
      expect(runtime.getProcessCalls()).toEqual([['git', 'log', '-p', '--format=', '--all', '--not', '--remotes']]);
    });

    it('quoted text that only mentions git push is not scanned and not blocked', async () => {
      const runtime = load(order);
      const result = await bash(runtime, 'echo "git push"');
      expect(result.forwarded).toBe(true);
      expect(runtime.getProcessCalls()).toEqual([]);
    });
  });

  it('model-router keeps an explicit subagent model next to the other Mods', async () => {
    const runtime = new MockRuntime();
    runtime.setState({ plugin: 'model-router', key: 'policy' }, { ...DEFAULT_POLICY, suggestOnly: false });
    for (const name of GUARDS_FIRST) runtime.load(REGISTER[name]);
    const result = await runtime.fire('agent.spawn', { name: 'editor', description: 'fix a typo', model: 'opus' });
    expect(result.terminalEvent).toEqual({ name: 'editor', description: 'fix a typo', model: 'opus' });
  });

  describe('telemetry', () => {
    it('never records a secret that secret-guard redacts', async () => {
      const runtime = load();
      runtime.setHostResult({ text: `creds: ${AWS_KEY}\n` });
      await bash(runtime, 'cat notes.txt');
      await runtime.fire('turn.complete', { turnId: 'T1', answer: 'done', durationMs: 5, isAborted: false });
      const store = runtime.getState({ plugin: 'run-observer', key: 'store' });
      expect(store).toBeDefined();
      expect(JSON.stringify(store)).not.toContain(AWS_KEY);
    });

    it('an observer failure does not stop the turn, and the guards still guard afterwards', async () => {
      const runtime = load();
      Object.defineProperty(runtime.api.clock, 'now', {
        value: () => {
          throw new Error('clock exploded');
        },
      });
      expect((await runtime.fire('turn.start', { turnId: 'T1' })).forwarded).toBe(true);
      const result = await bash(runtime, 'rm -rf build');
      expect(deny(result)).toMatch(/declined by the user|refus/i);
    });
  });

  describe('a failing observer registered OUTSIDE the guards cannot disable them', () => {
    // run-observer's .catch fails open ("no result"), so any throw before it
    // calls next() used to swallow every guard registered inside it.
    const breakClock = (runtime: MockRuntime): void => {
      Object.defineProperty(runtime.api.clock, 'now', {
        value: () => {
          throw new Error('clock exploded');
        },
      });
    };

    it('still refuses a destructive command', async () => {
      const runtime = load(OBSERVER_FIRST);
      breakClock(runtime);
      expect(deny(await bash(runtime, 'rm -rf build'))).toMatch(/declined by the user|refus/i);
    });

    it('still denies a Write containing a credential', async () => {
      const runtime = load(OBSERVER_FIRST);
      breakClock(runtime);
      const write = await runtime.fire('tool.call', { tool: 'Write', file_path: 'x.env', content: `K=${AWS_KEY}` });
      expect(deny(write)).toMatch(/aws-access-key/);
    });

    it('still redacts a credential in tool output', async () => {
      const runtime = load(OBSERVER_FIRST);
      breakClock(runtime);
      runtime.setHostResult({ text: `creds: ${AWS_KEY}\n` });
      const text = ((await bash(runtime, 'cat notes.txt')).value as { text?: string }).text ?? '';
      expect(text).not.toContain(AWS_KEY);
    });
  });

  it('a host reload (session.start twice) leaves every guard working', async () => {
    const runtime = load();
    await runtime.fire('session.start', { cwd: '/p', surface: null, isInteractive: true });
    await runtime.fire('session.start', { cwd: '/p', surface: null, isInteractive: true });
    expect(deny(await bash(runtime, 'rm -rf build'))).toMatch(/declined by the user|refus/i);
    const write = await runtime.fire('tool.call', { tool: 'Write', file_path: 'x.env', content: `K=${AWS_KEY}` });
    expect(deny(write)).toMatch(/aws-access-key/);
  });
});
