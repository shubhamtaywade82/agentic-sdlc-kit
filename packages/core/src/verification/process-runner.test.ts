// packages/core/src/verification/process-runner.test.ts
import { describe, expect, it } from 'vitest';
import type { ProjectProfile } from '@agentic-sdlc-kit/contracts';
import { ProcessVerificationRunner } from './process-runner.js';

describe('ProcessVerificationRunner', () => {
  const profile: ProjectProfile = {
    schemaVersion: 1,
    name: 'test-app',
    stack: ['node-typescript'],
    commands: {
      test: [['node', '-e', 'process.exit(0)']],
      lint: [['node', '-e', 'process.exit(0)']],
    },
  };

  it('executes configured checks safely and rolls up passed status', async () => {
    const runner = new ProcessVerificationRunner();
    const res = await runner.run(profile);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('passed');
      expect(res.value.checks).toHaveLength(2);
      expect(res.value.checks[0]?.status).toBe('passed');
    }
  });

  it('captures failure exit codes accurately', async () => {
    const failingProfile: ProjectProfile = {
      ...profile,
      commands: {
        test: [['node', '-e', "console.error('Boom'); process.exit(1)"]],
      },
    };
    const runner = new ProcessVerificationRunner();
    const res = await runner.run(failingProfile);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('failed');
      expect(res.value.checks[0]?.status).toBe('failed');
      expect(res.value.checks[0]?.evidence?.[0]).toContain('Boom');
    }
  });

  it('supports dryRun option marking checks as skipped', async () => {
    const runner = new ProcessVerificationRunner();
    const res = await runner.run(profile, { dryRun: true });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.checks.every((c) => c.status === 'skipped')).toBe(true);
    }
  });
});

describe('ProcessVerificationRunner.runCommand (task-targeted, classified)', () => {
  it('returns classification null and exit 0 for a passing command', async () => {
    const runner = new ProcessVerificationRunner();
    const res = await runner.runCommand(['node', '-e', 'console.log("ok"); process.exit(0)']);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.exitCode).toBe(0);
      expect(res.value.classification).toBeNull();
      expect(res.value.output).toContain('ok');
    }
  });

  it('classifies an assertion failure as assertion', async () => {
    const runner = new ProcessVerificationRunner();
    const res = await runner.runCommand([
      'node',
      '-e',
      'console.error("AssertionError: expected 1 to be 2"); process.exit(1)',
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.exitCode).toBe(1);
      expect(res.value.classification).toBe('assertion');
    }
  });

  it('classifies a missing executable as environment', async () => {
    const runner = new ProcessVerificationRunner();
    const res = await runner.runCommand(['kit-nonexistent-executable-xyz', '--flag']);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.classification).toBe('environment');
    }
  });

  it('classifies a killed long-running command as timeout', async () => {
    const runner = new ProcessVerificationRunner();
    const res = await runner.runCommand(
      ['node', '-e', 'setTimeout(() => process.exit(0), 5000);'],
      { timeoutMs: 150 },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.timedOut).toBe(true);
      expect(res.value.classification).toBe('timeout');
    }
  });

  it('refuses a dry run: phase evidence requires real execution (fail closed)', async () => {
    const runner = new ProcessVerificationRunner();
    const res = await runner.runCommand(['node', '-e', 'process.exit(0)'], { dryRun: true });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('dry run');
    }
  });
});
