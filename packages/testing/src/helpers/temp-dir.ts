// packages/testing/src/helpers/temp-dir.ts
//
// Creates and cleans up temp directories for tests.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface TempDir {
  path: string;
  cleanup: () => Promise<void>;
}

export async function makeTempDir(prefix = 'kit-test-'): Promise<TempDir> {
  const p = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    path: p,
    cleanup: async () => {
      await fs.rm(p, { recursive: true, force: true });
    },
  };
}
