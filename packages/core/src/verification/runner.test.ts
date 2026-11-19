// packages/core/src/verification/runner.test.ts
import { describe, expect, it } from 'vitest';
import { DryRunVerificationRunner } from './runner.js';
import type { ProjectProfile } from '@agentic-sdlc-kit/contracts';

const profile: ProjectProfile = {
  schemaVersion: 1,
  name: 'x',
  stack: ['node-typescript'],
  commands: {
    test: [['pnpm', 'test']],
    lint: [['pnpm', 'lint']],
    typecheck: [['pnpm', 'typecheck']],
    build: [['pnpm', 'build']],
  },
};

describe('DryRunVerificationRunner', () => {
  it('produces a report with an `architecture` check that passes', async () => {
    const r = await new DryRunVerificationRunner().run(profile);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const arch = r.value.checks.find((c) => c.id === 'architecture');
      expect(arch?.status).toBe('passed');
    }
  });

  it('marks every configured command check as `skipped` (M1 dry-run)', async () => {
    const r = await new DryRunVerificationRunner().run(profile);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const skipped = r.value.checks.filter((c) => c.status === 'skipped');
      expect(skipped.length).toBe(4); // test, lint, typecheck, build
      for (const c of skipped) {
        expect(c.command).toBeDefined();
      }
    }
  });

  it('INVARIANT: skipped checks do not promote the report to `failed`', async () => {
    const r = await new DryRunVerificationRunner().run(profile);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).not.toBe('failed');
      expect(r.value.status).toBe('passed'); // because architecture check passed
    }
  });

  it('INVARIANT: a profile with no commands and only the architecture check is `passed`', async () => {
    const minimalProfile: ProjectProfile = {
      schemaVersion: 1,
      name: 'x',
      stack: ['node-typescript'],
      commands: {},
    };
    const r = await new DryRunVerificationRunner().run(minimalProfile);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe('passed');
      expect(r.value.checks.length).toBe(1);
    }
  });

  it('includes commitSha when provided', async () => {
    const sha = '0'.repeat(40);
    const r = await new DryRunVerificationRunner().run(profile, { commitSha: sha });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.commitSha).toBe(sha);
  });
});
