import { describe, expect, it } from 'vitest';
import { QUESTION_BANK, type Question } from './question-bank.js';
import {
  applicableQuestions,
  emptyRecord,
  gateStatus,
  recordAnswer,
  unanswered,
  type ElicitationRecord,
} from './engine.js';

const NOW = new Date('2026-11-21T10:00:00.000Z');
const bank: Question[] = [
  { id: 'a', prompt: 'A?', options: [], blocking: true, why: 'x' },
  { id: 'b', prompt: 'B?', options: ['yes', 'no'], blocking: false, why: 'x' },
];

function apply(rec: ElicitationRecord, id: string, value: string, source: 'user' | 'assumption' = 'user') {
  const r = recordAnswer(rec, bank, id, value, source, NOW);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.record;
}

describe('stack filtering', () => {
  it('includes stack-agnostic questions and only the matching stack-scoped ones', () => {
    const ids = applicableQuestions(QUESTION_BANK, ['ruby-rails']).map((q) => q.id);
    expect(ids).toContain('users');
    expect(ids).toContain('rails-surface');
    expect(ids).not.toContain('node-framework');
    expect(ids).not.toContain('react-state');
  });

  it('applies no stack-scoped questions when the project has no stack', () => {
    const ids = applicableQuestions(QUESTION_BANK, []).map((q) => q.id);
    expect(ids).not.toContain('rails-surface');
    expect(ids).toContain('users');
  });
});

describe('recordAnswer validation', () => {
  it('rejects an unknown question id', () => {
    const r = recordAnswer(emptyRecord('F-1'), bank, 'zzz', 'x', 'user', NOW);
    expect(r).toEqual({ ok: false, error: { kind: 'unknown-question', questionId: 'zzz' } });
  });

  it('rejects an answer outside the closed option set', () => {
    const r = recordAnswer(emptyRecord('F-1'), bank, 'b', 'maybe', 'user', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid-option');
  });

  it('rejects an empty or whitespace-only answer', () => {
    const r = recordAnswer(emptyRecord('F-1'), bank, 'a', '   ', 'user', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('empty-answer');
  });

  it('never accepts an assumption for a blocking question', () => {
    const r = recordAnswer(emptyRecord('F-1'), bank, 'a', 'guess', 'assumption', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('assumption-not-allowed');
  });

  it('accepts an assumption for a non-blocking question and records its source', () => {
    const rec = apply(emptyRecord('F-1'), 'b', 'no', 'assumption');
    expect(rec.answers[0]).toMatchObject({ questionId: 'b', value: 'no', source: 'assumption' });
  });

  it('replaces an earlier answer to the same question instead of duplicating it', () => {
    const rec = apply(apply(emptyRecord('F-1'), 'a', 'first'), 'a', 'second');
    expect(rec.answers).toHaveLength(1);
    expect(rec.answers[0]?.value).toBe('second');
  });
});

describe('gate', () => {
  it('stays closed while a blocking question is unanswered', () => {
    expect(gateStatus(bank, emptyRecord('F-1'))).toEqual({ open: false, missingBlocking: ['a'] });
  });

  it('stays closed when the only blocking answer is an assumption', () => {
    const rec = emptyRecord('F-1');
    expect(gateStatus(bank, rec).open).toBe(false);
  });

  it('opens once every blocking question has a user answer', () => {
    const rec = apply(emptyRecord('F-1'), 'a', 'checkout users');
    expect(gateStatus(bank, rec)).toEqual({ open: true, missingBlocking: [] });
  });

  it('lists blocking questions before optional ones when prompting', () => {
    const order = unanswered(bank, emptyRecord('F-1')).map((q) => q.id);
    expect(order).toEqual(['a', 'b']);
  });
});
