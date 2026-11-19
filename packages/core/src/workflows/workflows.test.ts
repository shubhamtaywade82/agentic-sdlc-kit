// packages/core/src/workflows/workflows.test.ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scaffoldGreenfieldApp } from './app-workflow.js';
import { runBugfixWorkflow } from './fix-workflow.js';

describe('scaffoldGreenfieldApp (M8)', () => {
  it('scaffolds a complete greenfield application repository', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-app-test-'));
    try {
      const res = await scaffoldGreenfieldApp({
        name: 'market-maker',
        targetDir: tmp,
        stack: 'node-typescript',
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.name).toBe('market-maker');
        const profileStat = await fs.stat(res.value.profilePath);
        expect(profileStat.isFile()).toBe(true);
        const adrStat = await fs.stat(res.value.adrPath);
        expect(adrStat.isFile()).toBe(true);
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('runBugfixWorkflow (M9)', () => {
  it('runs bugfix workflow enforcing regression coverage', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-fix-test-'));
    try {
      const res = await scaffoldGreenfieldApp({ name: 'buggy-service', targetDir: tmp });
      expect(res.ok).toBe(true);
      if (res.ok) {
        const fixRes = await runBugfixWorkflow({
          issueId: 'BUG-042',
          projectRoot: res.value.appDir,
          dryRun: false,
        });
        // Verification of default empty npm test may fail because npm isn't run, or runner runs
        expect(fixRes.ok).toBe(true);
        if (fixRes.ok) {
          expect(fixRes.value.issueId).toBe('BUG-042');
          expect(fixRes.value.regressionCovered).toBe(true);
        }
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
