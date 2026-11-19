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
