// packages/contracts/src/observer/journal.test.ts
//
// Schema tests for the hash-chained execution journal (ADR-0021 §3).
import { describe, expect, it } from 'vitest';
import { JOURNAL_SCHEMA_VERSION, JournalActorSchema, JournalEventSchema } from './journal.js';

const SHA = 'a'.repeat(64); /* any 64-hex string; validity of the digest is core's job to compute */

describe('JournalActorSchema', () => {
  it('accepts a declared agent host', () => {
    expect(JournalActorSchema.safeParse({ kind: 'agent', host: 'cursor' }).success).toBe(true);
  });
  it('accepts an undeclared human (honest default, no guessing)', () => {
    expect(JournalActorSchema.safeParse({ kind: 'human' }).success).toBe(true);
  });
  it('rejects an empty host id', () => {
    expect(JournalActorSchema.safeParse({ kind: 'agent', host: '' }).success).toBe(false);
  });
});

describe('JournalEventSchema', () => {
  const base = {
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    seq: 0,
    ts: '2026-11-22T00:00:00.000Z',
    featureId: 'FEATURE-001',
    taskId: 'TASK-001',
    kind: 'phase.recorded',
    actor: { kind: 'human' },
    payload: { phase: 'red', status: 'failed', classification: 'assertion' },
    prevHash: 'GENESIS',
    hash: SHA,
  };

  it('accepts a genesis event', () => {
    expect(JournalEventSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a chained event with a hex prevHash', () => {
    expect(
      JournalEventSchema.safeParse({ ...base, seq: 1, prevHash: SHA, kind: 'phase.recorded' })
        .success,
    ).toBe(true);
  });

  it('rejects a non-hex prevHash', () => {
    expect(JournalEventSchema.safeParse({ ...base, prevHash: 'not-a-hash' }).success).toBe(false);
  });

  it('rejects GENESIS as an event hash (only prevHash may carry the sentinel)', () => {
    expect(JournalEventSchema.safeParse({ ...base, hash: 'GENESIS' }).success).toBe(false);
  });

  it('rejects a negative or fractional sequence number', () => {
    expect(JournalEventSchema.safeParse({ ...base, seq: -1 }).success).toBe(false);
    expect(JournalEventSchema.safeParse({ ...base, seq: 1.5 }).success).toBe(false);
  });

  it('rejects an unknown event kind', () => {
    expect(JournalEventSchema.safeParse({ ...base, kind: 'phase.skipped' }).success).toBe(false);
  });

  it('rejects a mismatched schema version', () => {
    expect(JournalEventSchema.safeParse({ ...base, schemaVersion: 2 }).success).toBe(false);
  });

  it('allows a missing taskId for run-level events', () => {
    expect(
      JournalEventSchema.safeParse({ ...base, taskId: undefined, kind: 'workflow.started' })
        .success,
    ).toBe(true);
  });
});
