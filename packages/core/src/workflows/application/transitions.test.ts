// packages/core/src/workflows/application/transitions.test.ts
import { describe, expect, it } from 'vitest';
import { canTransition, createApplicationState, isTerminal, transition } from './transitions.js';
import { validateContextForStage } from './validators.js';

const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const fixedClock = () => FIXED_TIME;

describe('createApplicationState', () => {
  it('creates a pending state at the intake stage with a stage history entry', () => {
    const s = createApplicationState('RUN-001', fixedClock);
    expect(s.status).toBe('pending');
    expect(s.stage).toBe('intake');
    expect(s.stageHistory).toHaveLength(1);
    expect(s.stageHistory[0]?.stage).toBe('intake');
    expect(s.revisions).toEqual([]);
  });
});

describe('application transition', () => {
  it('start moves pending → in_progress at intake', () => {
    const s = createApplicationState('RUN-001', fixedClock);
    const r = transition(s, 'start', { now: fixedClock });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe('in_progress');
      expect(r.value.stage).toBe('intake');
    }
  });

  it('advance moves intake → discovery', () => {
    const s = { ...createApplicationState('RUN-001', fixedClock), status: 'in_progress' } as const;
    const r = transition(s, 'advance', { now: fixedClock });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.stage).toBe('discovery');
  });

  it('advance advances through all stages in order', () => {
    let s = { ...createApplicationState('RUN-001', fixedClock), status: 'in_progress' } as const;
    const expected = [
      'discovery',
      'requirements',
      'architecture',
      'planning',
      'scaffolding',
      'implementation',
      'verification',
      'review',
      'release',
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

  it('INVARIANT: complete is only allowed from the release stage', () => {
    const s = {
      ...createApplicationState('RUN-001', fixedClock),
      status: 'in_progress',
      stage: 'verification',
    } as const;
    const r = transition(s, 'complete', { now: fixedClock });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INTERNAL');
  });

  it('complete from release moves to completed', () => {
    const s = {
      ...createApplicationState('RUN-001', fixedClock),
      status: 'in_progress',
      stage: 'release',
    } as const;
    const r = transition(s, 'complete', { now: fixedClock });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe('completed');
  });

  it('INVARIANT: cannot transition out of completed', () => {
    const s = {
      ...createApplicationState('RUN-001', fixedClock),
      status: 'completed',
      stage: 'release',
    } as const;
    for (const t of [
      'start',
      'advance',
      'block',
      'resume',
      'complete',
      'fail',
      'revise',
    ] as const) {
      const r = transition(s, t, { now: fixedClock });
      expect(r.ok).toBe(false);
    }
  });

  it('INVARIANT: cannot transition out of failed', () => {
    const s = {
      ...createApplicationState('RUN-001', fixedClock),
      status: 'failed',
      stage: 'release',
    } as const;
    for (const t of [
      'start',
      'advance',
      'block',
      'resume',
      'complete',
      'fail',
      'revise',
    ] as const) {
      const r = transition(s, t, { now: fixedClock });
      expect(r.ok).toBe(false);
    }
  });

  it('revise moves to a prior stage', () => {
    const s = {
      ...createApplicationState('RUN-001', fixedClock),
      status: 'in_progress',
      stage: 'planning',
    } as const;
    const r = transition(s, 'revise', { now: fixedClock, reviseTo: 'requirements' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.stage).toBe('requirements');
      expect(r.value.status).toBe('in_progress');
      expect(r.value.revisions).toHaveLength(1);
      expect(r.value.revisions[0]?.fromStage).toBe('planning');
      expect(r.value.revisions[0]?.toStage).toBe('requirements');
    }
  });

  it('INVARIANT: revise cannot move to a later stage', () => {
    const s = {
      ...createApplicationState('RUN-001', fixedClock),
      status: 'in_progress',
      stage: 'intake',
    } as const;
    const r = transition(s, 'revise', { now: fixedClock, reviseTo: 'architecture' });
    expect(r.ok).toBe(false);
  });

  it('INVARIANT: revise cannot stay at the same stage', () => {
    const s = {
      ...createApplicationState('RUN-001', fixedClock),
      status: 'in_progress',
      stage: 'architecture',
    } as const;
    const r = transition(s, 'revise', { now: fixedClock, reviseTo: 'architecture' });
    expect(r.ok).toBe(false);
  });

  it('block moves in_progress → blocked; resume moves blocked → in_progress', () => {
    const s = {
      ...createApplicationState('RUN-001', fixedClock),
      status: 'in_progress',
      stage: 'architecture',
    } as const;
    const blocked = transition(s, 'block', { now: fixedClock });
    expect(blocked.ok).toBe(true);
    if (blocked.ok) expect(blocked.value.status).toBe('blocked');
    const resumed = transition(blocked.ok ? blocked.value : s, 'resume', { now: fixedClock });
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(resumed.value.status).toBe('in_progress');
  });
});

describe('canTransition', () => {
  it('allows start from pending only', () => {
    expect(canTransition('pending', 'start')).toBe(true);
    expect(canTransition('in_progress', 'start')).toBe(false);
  });
});

describe('isTerminal', () => {
  it('returns true for completed and failed', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
  });
  it('returns false for pending, in_progress, blocked', () => {
    expect(isTerminal('pending')).toBe(false);
    expect(isTerminal('in_progress')).toBe(false);
    expect(isTerminal('blocked')).toBe(false);
  });
});

describe('validateContextForStage', () => {
  it('rejects architecture stage without a brief and specification', () => {
    const r = validateContextForStage('architecture', {
      openDecisions: [],
    });
    expect(r.ok).toBe(false);
  });
  it('accepts architecture stage with a brief and specification', () => {
    const r = validateContextForStage('architecture', {
      brief: 'x',
      specification: {
        id: 'FEATURE-001',
        title: 'x',
        overview: 'x',
        problem: 'x',
        scope: { in: [], out: [] },
        actors: [],
        functionalRequirements: [],
        nonFunctionalRequirements: [],
        acceptanceCriteria: [],
        edgeCases: [],
        dependencies: [],
        risks: [],
        openQuestions: [],
      },
      openDecisions: [],
    });
    expect(r.ok).toBe(true);
  });
  it('rejects release stage without verification reports and a review', () => {
    const r = validateContextForStage('release', { openDecisions: [] });
    expect(r.ok).toBe(false);
  });
});
