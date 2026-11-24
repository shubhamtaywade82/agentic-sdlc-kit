// plugins/secret-guard/tests/register.test.ts
//
// Behavioral tests against the MockRuntime, which mirrors the REAL host
// contract: tool.call carries the arguments as fields of e (e.command for
// Bash, e.file_path + e.content for Write, e.new_string for Edit);
// $.process.run resolves queued results; a hook error runs the chained
// .catch (fail closed).
import { describe, expect, it } from 'vitest';
import { MockRuntime } from '@agentic-sdlc-kit/mod-sdk';
import { register } from '../hooks/register';
import { DEFAULT_REDACTION_POLICY } from '../policies/detect';

// Real-shaped (but fake) samples for detection. None of these are valid
// credentials.
const AWS_KEY_SAMPLE = 'AKIAIOSFODNNN7EXAMPLE';
const GITHUB_TOKEN_SAMPLE = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
const SLACK_TOKEN_SAMPLE = 'xoxb-1234567890abcdefghijklmnop';

describe('secret-guard register', () => {
  it('registers three gated tool.call handlers plus the result redactor', () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    expect(runtime.registrationCount('tool.call')).toBe(4);
  });

  it('denies a Write of a file containing an AWS access key', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const result = await runtime.fire('tool.call', {
      tool: 'Write',
      file_path: 'config.env',
      content: `AWS_KEY=${AWS_KEY_SAMPLE}\n`,
    });
    expect(result.answered).toBe(true);
    const value = result.value as { deny?: string };
    expect(value.deny).toMatch(/secret-guard/);
    expect(value.deny).toMatch(/aws-access-key/);
  });

  it('denies an Edit whose new_string adds a GitHub token', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const result = await runtime.fire('tool.call', {
      tool: 'Edit',
      file_path: 'scripts/deploy.sh',
      old_string: 'TOKEN=',
      new_string: `TOKEN=${GITHUB_TOKEN_SAMPLE}`,
    });
    expect(result.answered).toBe(true);
    const value = result.value as { deny?: string };
    expect(value.deny).toMatch(/github-token/);
  });

  it('forwards a Write of clean content', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const result = await runtime.fire('tool.call', {
      tool: 'Write',
      file_path: 'README.md',
      content: '# Hello world\nThis is a normal file.\n',
    });
    expect(result.forwarded).toBe(true);
    expect(result.answered).toBe(false);
  });

  it('scans the staged diff before a git commit and denies a secret in it', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    runtime.queueProcessResults({
      stdout: `+password = "${AWS_KEY_SAMPLE}"\n`,
      exitCode: 0,
    });
    const result = await runtime.fire('tool.call', {
      tool: 'Bash',
      command: "git commit -m 'release v1.0.0'",
    });
    expect(result.answered).toBe(true);
    const value = result.value as { deny?: string };
    expect(value.deny).toMatch(/staged changes contain/);
    expect(runtime.getProcessCalls()).toEqual([['git', 'diff', '--cached']]);
  });

  it('forwards a git commit whose staged diff is clean', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    runtime.queueProcessResults({ stdout: '+const x = 1;\n', exitCode: 0 });
    const result = await runtime.fire('tool.call', {
      tool: 'Bash',
      command: "git commit -m 'add x'",
    });
    expect(result.forwarded).toBe(true);
    expect(result.answered).toBe(false);
  });

  it('fails closed when the staged diff cannot be read', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    runtime.queueProcessResults({ stdout: '', stderr: 'fatal: not a git repository', exitCode: 128 });
    const result = await runtime.fire('tool.call', {
      tool: 'Bash',
      command: "git commit -m 'x'",
    });
    expect(result.answered).toBe(true);
    expect((result.value as { deny?: string }).deny).toMatch(/could not read the staged changes/);
  });

  it('fails closed when the unpushed commits cannot be read', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    runtime.queueProcessResults({ stdout: '', stderr: 'fatal: not a git repository', exitCode: 128 });
    const result = await runtime.fire('tool.call', { tool: 'Bash', command: 'git push origin' });
    expect((result.value as { deny?: string }).deny).toMatch(/could not read the locally reachable commit history/);
  });

  it('does not run git for a non-git Bash command', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const result = await runtime.fire('tool.call', {
      tool: 'Bash',
      command: 'ls -la',
    });
    expect(result.forwarded).toBe(true);
    expect(runtime.getProcessCalls()).toEqual([]);
  });

  it('redacts secrets from a tool result the model would read', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    runtime.setHostResult({
      text: `config: ${SLACK_TOKEN_SAMPLE} and ${AWS_KEY_SAMPLE}`,
      isError: false,
    });
    const result = await runtime.fire('tool.call', {
      tool: 'Bash',
      command: 'cat config.env',
    });
    const value = result.value as { text?: string };
    expect(value.text).not.toContain(SLACK_TOKEN_SAMPLE);
    expect(value.text).not.toContain(AWS_KEY_SAMPLE);
    expect(value.text).toContain('[REDACTED:');
    expect(runtime.getLogs().some((l) => l.includes('redacted 2 secret(s)'))).toBe(true);
  });

  it('leaves a denied tool result untouched (no double handling)', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    runtime.setHostResult({ deny: 'refused by a later hook' });
    const result = await runtime.fire('tool.call', { tool: 'Bash', command: 'cat .env' });
    expect(result.value).toEqual({ deny: 'refused by a later hook' });
  });

  it('fails CLOSED via .catch when a gated hook errors', async () => {
    const runtime = new MockRuntime();
    // Poison the policy key: getPolicy throws inside the Write hook.
    runtime.poisonState('secret-guard', 'policy');
    runtime.load(register);
    const result = await runtime.fire('tool.call', {
      tool: 'Write',
      file_path: 'x.txt',
      content: 'hello',
    });
    expect(result.answered).toBe(true);
    expect((result.value as { deny?: string }).deny).toMatch(/fail closed/);
  });

  it('denies a commit when the staged diff is too large to scan (never unscanned)', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    runtime.setState(
      { plugin: 'secret-guard', key: 'policy' },
      { ...DEFAULT_REDACTION_POLICY, maxInputChars: 64 },
    );
    runtime.queueProcessResults({ stdout: '+' + 'x'.repeat(500) + '\n', exitCode: 0 });
    const result = await runtime.fire('tool.call', { tool: 'Bash', command: 'git commit -m "big"' });
    expect(result.answered).toBe(true);
    expect((result.value as { deny?: string }).deny).toMatch(/too large|not scanned/i);
  });

  it('withholds a tool result too large to scan instead of passing it through', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    runtime.setState(
      { plugin: 'secret-guard', key: 'policy' },
      { ...DEFAULT_REDACTION_POLICY, maxInputChars: 64 },
    );
    const big = 'filler '.repeat(40) + AWS_KEY_SAMPLE;
    runtime.setHostResult({ text: big });
    const result = await runtime.fire('tool.call', { tool: 'Bash', command: 'cat huge.log' });
    const text = (result.value as { text?: string }).text ?? '';
    expect(text).not.toContain(AWS_KEY_SAMPLE);
    expect(text).toMatch(/WITHHELD/);
    expect(runtime.getLogs().some((l) => /not scanned/i.test(l))).toBe(true);
  });

  describe('git detection and what gets scanned', () => {
    const fire = (runtime: MockRuntime, command: string) =>
      runtime.fire('tool.call', { tool: 'Bash', command });
    const secretDiff = `+k = "${AWS_KEY_SAMPLE}"\n`;

    it('denies commits whose git global options can redirect the scan context', async () => {
      for (const command of ['git -C sub commit -m x', 'git -c user.name=x commit -m x', 'cd sub && git commit -m x']) {
        const runtime = new MockRuntime();
        runtime.load(register);
        const result = await fire(runtime, command);
        expect((result.value as { deny?: string }).deny, command).toMatch(/repository context or push target scope cannot be verified/);
        expect(runtime.getProcessCalls()).toEqual([]);
      }
    });

    it('does not scan quoted text that merely mentions git push', async () => {
      const runtime = new MockRuntime();
      runtime.load(register);
      const result = await fire(runtime, 'echo "git push"');
      expect(result.forwarded).toBe(true);
      expect(runtime.getProcessCalls()).toEqual([]);
    });

    it('scans tracked working-tree changes too when the commit stages them (-a)', async () => {
      const runtime = new MockRuntime();
      runtime.load(register);
      runtime.queueProcessResults({ stdout: '' }, { stdout: secretDiff });
      const result = await fire(runtime, 'git commit -am "x"');
      expect((result.value as { deny?: string }).deny).toMatch(/working-tree changes being committed contain/);
      expect(runtime.getProcessCalls()).toEqual([
        ['git', 'diff', '--cached'],
        ['git', 'diff'],
      ]);
    });

    it('scans local commit history across refs before a push', async () => {
      const runtime = new MockRuntime();
      runtime.load(register);
      runtime.queueProcessResults({ stdout: secretDiff });
      const result = await fire(runtime, 'git push origin');
      expect((result.value as { deny?: string }).deny).toMatch(/locally reachable commit history contain/);
      expect(runtime.getProcessCalls()).toEqual([['git', 'log', '-p', '--format=', '--all', '--not', '--remotes']]);
    });

    it.each([
      'git push origin main',
      'git push --all',
      'git push --tags',
      'git push --mirror',
      'git push origin feature:production',
      'git -C sub push',
      'cd sub && git push',
    ])('denies unsupported push scope without running a misleading scan: %s', async (command) => {
      const runtime = new MockRuntime();
      runtime.load(register);
      const result = await fire(runtime, command);
      expect((result.value as { deny?: string }).deny).toMatch(/target scope cannot be verified|repository context or push target scope cannot be verified/i);
      expect(runtime.getProcessCalls()).toEqual([]);
    });

    it('forwards a push whose unpushed commits are clean', async () => {
      const runtime = new MockRuntime();
      runtime.load(register);
      runtime.queueProcessResults({ stdout: '+const x = 1;\n' });
      const result = await fire(runtime, 'git push');
      expect(result.forwarded).toBe(true);
      expect(result.answered).toBe(false);
    });

    it('denies a push when the unpushed history is too large to scan', async () => {
      const runtime = new MockRuntime();
      runtime.load(register);
      runtime.setState(
        { plugin: 'secret-guard', key: 'policy' },
        { ...DEFAULT_REDACTION_POLICY, maxInputChars: 64 },
      );
      runtime.queueProcessResults({ stdout: '+' + 'x'.repeat(500) });
      const result = await fire(runtime, 'git push');
      expect((result.value as { deny?: string }).deny).toMatch(/not scanned|too large/i);
    });

    it('scans a commit and a push chained in one command', async () => {
      const runtime = new MockRuntime();
      runtime.load(register);
      runtime.queueProcessResults({ stdout: '+ok\n' }, { stdout: secretDiff });
      const result = await fire(runtime, 'git commit -m x && git push');
      expect((result.value as { deny?: string }).deny).toMatch(/locally reachable commit history contain/);
    });
  });
});
