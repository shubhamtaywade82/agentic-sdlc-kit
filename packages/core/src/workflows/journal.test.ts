// packages/core/src/workflows/journal.test.ts
//
// Tests for the hash-chained execution journal (ADR-0021 §3): append,
// chain linkage, verification, and tamper detection.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { JournalEvent } from '@agentic-sdlc-kit/contracts';
import { appendJournalEvent, journalPath, readJournal, verifyJournal } from './journal.js';

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'kit-journal-'));
}

const ACTOR = { kind: 'human' } as const;

describe('appendJournalEvent', () => {
  it('creates a genesis event (seq 0, prevHash GENESIS) with a valid digest', async () => {
    const root = await tempRoot();
    const res = await appendJournalEvent(root, {
      featureId: 'FEATURE-001',
      kind: 'workflow.started',
      actor: ACTOR,
      payload: { taskCount: 1 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.seq).toBe(0);
    expect(res.value.prevHash).toBe('GENESIS');
    expect(res.value.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('chains subsequent events to the previous hash with increasing seq', async () => {
    const root = await tempRoot();
    const first = await appendJournalEvent(root, {
      featureId: 'FEATURE-001',
      kind: 'workflow.started',
      actor: ACTOR,
      payload: {},
    });
    const second = await appendJournalEvent(root, {
      featureId: 'FEATURE-001',
      taskId: 'TASK-001',
      kind: 'phase.recorded',
      actor: ACTOR,
      payload: { phase: 'red' },
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.seq).toBe(1);
    expect(second.value.prevHash).toBe(first.value.hash);
  });

  it('persists one JSON line per event', async () => {
    const root = await tempRoot();
    await appendJournalEvent(root, {
      featureId: 'FEATURE-001',
      kind: 'workflow.started',
      actor: ACTOR,
      payload: {},
    });
    await appendJournalEvent(root, {
      featureId: 'FEATURE-001',
      kind: 'workflow.finalized',
      actor: ACTOR,
      payload: { status: 'passed' },
    });
    const text = await fs.readFile(journalPath(root, 'FEATURE-001'), 'utf8');
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('defensively redacts secret-looking payload strings at the boundary', async () => {
    const root = await tempRoot();
    const token = `ghp_${'abcdefghijklmnopqrstuvwxyz1234567890'}`; // matches github-token rule
    const res = await appendJournalEvent(root, {
      featureId: 'FEATURE-001',
      kind: 'phase.failed',
      actor: ACTOR,
      payload: {
        evidence: `exit=1 — token ${token} leaked into output`,
      },
    });
    expect(res.ok).toBe(true);
    const text = await fs.readFile(journalPath(root, 'FEATURE-001'), 'utf8');
    expect(text).not.toContain(token);
    expect(text).toContain('[REDACTED');
  });

  it('never throws on IO failure (observability must not block the workflow)', async () => {
    // A FILE where the journal DIRECTORY should be forces mkdir to fail.
    const root = await tempRoot();
    await fs.writeFile(path.join(root, '.ai-kit'), 'not a directory', 'utf8');
    const res = await appendJournalEvent(root, {
      featureId: 'FEATURE-001',
      kind: 'workflow.started',
      actor: ACTOR,
      payload: {},
    });
    expect(res.ok).toBe(false);
  });
});

describe('readJournal', () => {
  it('returns an error for a missing journal', async () => {
    const root = await tempRoot();
    const res = await readJournal(root, 'FEATURE-404');
    expect(res.ok).toBe(false);
  });

  it('round-trips appended events', async () => {
    const root = await tempRoot();
    await appendJournalEvent(root, {
      featureId: 'FEATURE-001',
      kind: 'workflow.started',
      actor: ACTOR,
      payload: { taskCount: 2 },
    });
    const res = await readJournal(root, 'FEATURE-001');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toHaveLength(1);
    expect(res.value[0]?.kind).toBe('workflow.started');
  });

  it('rejects a line that violates the event contract', async () => {
    const root = await tempRoot();
    const file = journalPath(root, 'FEATURE-001');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '{"not":"an event"}\n', 'utf8');
    const res = await readJournal(root, 'FEATURE-001');
    expect(res.ok).toBe(false);
  });
});

describe('verifyJournal', () => {
  async function chainOf(root: string, count: number): Promise<JournalEvent[]> {
    const events: JournalEvent[] = [];
    for (let i = 0; i < count; i++) {
      const res = await appendJournalEvent(root, {
        featureId: 'FEATURE-001',
        taskId: 'TASK-001',
        kind: 'phase.recorded',
        actor: ACTOR,
        payload: { seq: i },
      });
      if (res.ok) events.push(res.value);
    }
    return events;
  }

  it('verifies an intact chain and reports the last hash as an anchor', async () => {
    const root = await tempRoot();
    const events = await chainOf(root, 3);
    const res = await verifyJournal(root, 'FEATURE-001');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.eventCount).toBe(3);
    expect(res.value.lastHash).toBe(events[2]?.hash);
  });

  it('detects a mutated payload (hash mismatch)', async () => {
    const root = await tempRoot();
    await chainOf(root, 2);
    const file = journalPath(root, 'FEATURE-001');
    const lines = (await fs.readFile(file, 'utf8')).split('\n').filter((l) => l.trim());
    const first = JSON.parse(lines[0] ?? '{}') as { payload: Record<string, unknown> };
    first.payload['seq'] = 999; // mutate WITHOUT recomputing the hash
    lines[0] = JSON.stringify(first);
    await fs.writeFile(file, `${lines.join('\n')}\n`, 'utf8');
    const res = await verifyJournal(root, 'FEATURE-001');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain('seq 0');
  });

  it('detects a deleted middle event (seq gap)', async () => {
    const root = await tempRoot();
    await chainOf(root, 3);
    const file = journalPath(root, 'FEATURE-001');
    const lines = (await fs.readFile(file, 'utf8')).split('\n').filter((l) => l.trim());
    lines.splice(1, 1); // remove the middle event
    await fs.writeFile(file, `${lines.join('\n')}\n`, 'utf8');
    const res = await verifyJournal(root, 'FEATURE-001');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain('expected seq 1');
  });

  it('detects a broken prevHash link', async () => {
    const root = await tempRoot();
    await chainOf(root, 2);
    const file = journalPath(root, 'FEATURE-001');
    const lines = (await fs.readFile(file, 'utf8')).split('\n').filter((l) => l.trim());
    const second = JSON.parse(lines[1] ?? '{}') as { prevHash: string };
    second.prevHash = '0'.repeat(64); // valid shape, wrong link
    lines[1] = JSON.stringify(second);
    await fs.writeFile(file, `${lines.join('\n')}\n`, 'utf8');
    const res = await verifyJournal(root, 'FEATURE-001');
    expect(res.ok).toBe(false);
  });

  it('fails for a missing journal (honest: nothing to verify)', async () => {
    const root = await tempRoot();
    const res = await verifyJournal(root, 'FEATURE-404');
    expect(res.ok).toBe(false);
  });
});
