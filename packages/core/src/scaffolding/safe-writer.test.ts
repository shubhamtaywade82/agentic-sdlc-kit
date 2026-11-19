// packages/core/src/scaffolding/safe-writer.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeWrite, planWrite, resolveTargetPath } from './safe-writer.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-scaffold-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('resolveTargetPath', () => {
  it('resolves a clean relative path', () => {
    const r = resolveTargetPath(tmp, 'src/index.ts');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(path.resolve(tmp, 'src/index.ts'));
  });
  it('REJECTS a path escape with ..', () => {
    const r = resolveTargetPath(tmp, '../escape.ts');
    expect(r.ok).toBe(false);
  });
  it('REJECTS a deeply nested escape attempt', () => {
    const r = resolveTargetPath(tmp, 'ok/../../../escape.ts');
    expect(r.ok).toBe(false);
  });
});

describe('planWrite', () => {
  it('plans a create when the file does not exist', async () => {
    const r = await planWrite(tmp, 'new-file.ts', false);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.kind).toBe('create');
  });
  it('plans overwrite-approved when the file exists and preserve=false', async () => {
    await fs.writeFile(path.resolve(tmp, 'exists.ts'), 'old');
    const r = await planWrite(tmp, 'exists.ts', false);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.kind).toBe('overwrite-approved');
  });
  it('plans skip-existing when the file exists and preserve=true', async () => {
    await fs.writeFile(path.resolve(tmp, 'config.json'), '{}');
    const r = await planWrite(tmp, 'config.json', true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.kind).toBe('skip-existing');
  });
});

describe('executeWrite', () => {
  it('creates the file and parent directories', async () => {
    const r = await executeWrite(
      tmp,
      { path: 'src/deep/file.ts', kind: 'create' },
      'export const x = 1;',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.bytesWritten).toBeGreaterThan(0);
      const content = await fs.readFile(path.resolve(tmp, 'src/deep/file.ts'), 'utf8');
      expect(content).toBe('export const x = 1;');
    }
  });
  it('is a no-op for skip-existing', async () => {
    const r = await executeWrite(
      tmp,
      { path: 'x.ts', kind: 'skip-existing', reason: 'preserve' },
      'new content',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.bytesWritten).toBeUndefined();
  });
});
