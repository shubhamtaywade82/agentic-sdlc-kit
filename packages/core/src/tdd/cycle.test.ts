// packages/core/src/tdd/cycle.test.ts
import { describe, expect, it } from 'vitest';
import { TddSession } from './cycle.js';

describe('TddSession', () => {
  it('starts in red phase', () => {
    const session = new TddSession('TASK-001');
    expect(session.getCurrentPhase()).toBe('red');
  });

  it('fails to advance red phase when test passes', () => {
    const session = new TddSession('TASK-001');
    const r = session.advance({ status: 'passed', evidence: 'Unexpected pass' });
    expect(r.ok).toBe(false);
    expect(session.getCurrentPhase()).toBe('red');
  });

  it('advances from red to green when test fails as expected', () => {
    const session = new TddSession('TASK-001');
    const r = session.advance({ status: 'failed', evidence: 'Expected test failure' });
    expect(r.ok).toBe(true);
    expect(session.getCurrentPhase()).toBe('green');
  });

  it('completes full Red-Green-Refactor cycle', () => {
    const session = new TddSession('TASK-001');
    expect(session.advance({ status: 'failed' }).ok).toBe(true);
    expect(session.getCurrentPhase()).toBe('green');

    expect(session.advance({ status: 'passed' }).ok).toBe(true);
    expect(session.getCurrentPhase()).toBe('refactor');

    expect(session.advance({ status: 'passed' }).ok).toBe(true);
    expect(session.getCurrentPhase()).toBe('completed');
    expect(session.getHistory()).toHaveLength(3);
  });

  it('resumes from a persisted snapshot without losing history', () => {
    const first = new TddSession('TASK-001');
    first.advance({ status: 'failed', evidence: 'red evidence' });
    first.advance({ status: 'passed', evidence: 'green evidence' });

    const resumed = new TddSession('TASK-001', {
      phase: first.getCurrentPhase(),
      records: first.getHistory(),
    });
    expect(resumed.getCurrentPhase()).toBe('refactor');
    expect(resumed.getHistory()).toHaveLength(2);

    const r = resumed.advance({ status: 'passed', evidence: 'refactor evidence' });
    expect(r.ok).toBe(true);
    expect(resumed.getHistory()).toHaveLength(3);
  });
});
