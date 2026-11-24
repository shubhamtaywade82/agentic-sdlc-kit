// packages/core/src/workflows/workflows.test.ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scaffoldGreenfieldApp } from './app-workflow.js';

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
