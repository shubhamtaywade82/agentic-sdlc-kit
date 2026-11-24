// packages/core/src/workflows/state-root.test.ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { kitStateRoot } from './state-root.js';
import { featureRunPath } from './tdd-run-store.js';
import { journalPath, appendJournalEvent, readJournal } from './journal.js';

describe('kitStateRoot', () => {
  it('defaults to <root>/.ai-kit', () => {
    expect(kitStateRoot('/p/app', {})).toBe(path.resolve('/p/app', '.ai-kit'));
    expect(kitStateRoot('/p/app', { KIT_STATE_DIR: '' })).toBe(path.resolve('/p/app', '.ai-kit'));
  });

  it('relocates under KIT_STATE_DIR with a per-root key', () => {
    const a = kitStateRoot('/p/app', { KIT_STATE_DIR: '/s' });
    const b = kitStateRoot('/q/app', { KIT_STATE_DIR: '/s' });
    expect(a.startsWith('/s/app-')).toBe(true);
    expect(a).not.toBe(b); // same basename, different roots must not collide
    expect(kitStateRoot('/p/app', { KIT_STATE_DIR: '/s' })).toBe(a); // deterministic
  });

  it('fails closed on a relative override', () => {
    expect(() => kitStateRoot('/p/app', { KIT_STATE_DIR: 'rel/dir' })).toThrow(/absolute/);
  });
});

describe('machinery paths honour KIT_STATE_DIR', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-state-root-'));
    process.env['KIT_STATE_DIR'] = path.join(tmp, 'state');
  });
  afterEach(async () => {
    delete process.env['KIT_STATE_DIR'];
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('routes run state and journal outside the project', () => {
    const root = path.join(tmp, 'proj');
    expect(featureRunPath(root, 'F-1').startsWith(path.join(tmp, 'state'))).toBe(true);
    expect(journalPath(root, 'F-1').startsWith(path.join(tmp, 'state'))).toBe(true);
  });

  it('journal append/read round-trips without creating .ai-kit in the project', async () => {
    const root = path.join(tmp, 'proj');
    await fs.mkdir(root);
    const res = await appendJournalEvent(root, {
      featureId: 'F-1',
      kind: 'workflow.started',
      actor: { kind: 'human' },
      payload: {},
    });
    expect(res.ok).toBe(true);
    const read = await readJournal(root, 'F-1');
    expect(read.ok && read.value.length).toBe(1);
    await expect(fs.stat(path.join(root, '.ai-kit'))).rejects.toThrow();
  });
});
