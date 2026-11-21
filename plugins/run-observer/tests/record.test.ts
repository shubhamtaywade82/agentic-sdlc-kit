import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runRecord } from '../hooks/record.js';
import { appendRecord, buildRecord, LOG_RELATIVE_PATH } from '../policies/record.js';

const NOW = new Date('2026-11-21T10:00:00.000Z');

describe('run-observer record', () => {
  it('records metadata and never the tool input or output', () => {
    const line = buildRecord(
      { session_id: 's1', hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 't1', tool_input: { command: 'echo AKIAIOSFODNN7EXAMPLE' } } as never,
      NOW,
    );
    expect(line).not.toMatch(/AKIA/);
    expect(JSON.parse(line)).toEqual({
      ts: '2026-11-21T10:00:00.000Z',
      session_id: 's1',
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_use_id: 't1',
    });
  });

  it('writes one line per call under the project state directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'run-observer-'));
    try {
      expect(runRecord(JSON.stringify({ cwd: root, tool_name: 'Read' }), NOW)).toEqual({ exitCode: 0 });
      runRecord(JSON.stringify({ cwd: root, tool_name: 'Edit' }), NOW);
      const lines = (await fs.readFile(path.join(root, LOG_RELATIVE_PATH), 'utf8')).trim().split('\n');
      expect(lines.map((l) => JSON.parse(l).tool_name)).toEqual(['Read', 'Edit']);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('stops appending at the size cap', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'run-observer-cap-'));
    try {
      const file = path.join(root, 'events.jsonl');
      expect(appendRecord(file, 'x'.repeat(20), 10)).toBe(true);
      expect(appendRecord(file, 'y', 10)).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('always exits 0, even on malformed input', () => {
    expect(runRecord('{nope').exitCode).toBe(0);
  });
});
