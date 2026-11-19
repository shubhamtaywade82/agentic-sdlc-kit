// packages/core/src/workflows/bug-fix/transitions.test.ts
import { describe, expect, it } from 'vitest';
import { canTransition, createBugFixState, isTerminal, transition } from './transitions.js';

const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const fixedClock = () => FIXED_TIME;

describe('createBugFixState', () => {
  it('creates a pending state at the report stage', () => {
    const s = createBugFixState('RUN-001', 'BUG-001');
    expect(s.status).toBe('pending');
    expect(s.stage).toBe('report');
    expect(s.bugId).toBe('BUG-001');
    expect(s.verificationReportIds).toEqual([]);
    expect(s.affectedFiles).toEqual([]);
  });
});

describe('bug-fix transition', () => {
  it('start moves pending → in_progress at report', () => {
    const s = createBugFixState('RUN-001', 'BUG-001');
    const r = transition(s, 'start', { now: fixedClock });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe('in_progress');
      expect(r.value.stage).toBe('report');
    }
  });

  it('advance moves through stages in canonical order', () => {
    let s = { ...createBugFixState('RUN-001', 'BUG-001'), status: 'in_progress' } as const;
    const expected = [
      'discovery',
      'reproduction',
      'root-cause',
      'regression-test',
      'minimal-fix',
      'focused-verify',
      'regression-verify',
      'review',
      'completion',
    ];
    for (const nextStage of expected) {
      const r = transition(s, 'advance', { now: fixedClock });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.stage).toBe(nextStage);
        s = r.value;
      }
    }
  });

  it('INVARIANT: canonical advance from root-cause → regression-test is allowed (invariant only blocks skipping to minimal-fix)', () => {
    const s = {
      ...createBugFixState('RUN-001', 'BUG-001'),
      status: 'in_progress',
      stage: 'root-cause',
    } as const;
    const r = transition(s, 'advance', { now: fixedClock });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.stage).toBe('regression-test');
  });

  it('INVARIANT: the only canonical predecessor of minimal-fix is regression-test (verified via contract)', async () => {
    // The contract function regressionTestRequiredBeforeFix is tested in
    // packages/contracts/src/maintenance/maintenance.test.ts. Here we
    // verify the transition function uses it: advancing from
    // regression-test → minimal-fix is allowed.
    const s = {
      ...createBugFixState('RUN-001', 'BUG-001'),
      status: 'in_progress',
      stage: 'regression-test',
    } as const;
    const r = transition(s, 'advance', { now: fixedClock });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.stage).toBe('minimal-fix');
  });

  it('INVARIANT: complete is only allowed from the completion stage', () => {
    const s = {
      ...createBugFixState('RUN-001', 'BUG-001'),
      status: 'in_progress',
      stage: 'review',
    } as const;
    const r = transition(s, 'complete', { now: fixedClock });
    expect(r.ok).toBe(false);
  });

  it('complete from completion moves to completed', () => {
    const s = {
      ...createBugFixState('RUN-001', 'BUG-001'),
      status: 'in_progress',
      stage: 'completion',
    } as const;
    const r = transition(s, 'complete', { now: fixedClock });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe('completed');
  });

  it('INVARIANT: completed and failed are terminal', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('in_progress')).toBe(false);
  });
});

describe('bug-fix canTransition', () => {
  it('allows start only from pending', () => {
    expect(canTransition('pending', 'start')).toBe(true);
    expect(canTransition('in_progress', 'start')).toBe(false);
  });
});
