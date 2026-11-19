// packages/core/src/workflows/refactor/transitions.test.ts
import { describe, expect, it } from 'vitest';
import { canTransition, createRefactorState, isTerminal, transition } from './transitions.js';

const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const fixedClock = () => FIXED_TIME;

describe('createRefactorState', () => {
  it('creates a pending state at the contract stage', () => {
    const s = createRefactorState('RUN-001', 'REFACTOR-001');
    expect(s.status).toBe('pending');
    expect(s.stage).toBe('contract');
    expect(s.refactorId).toBe('REFACTOR-001');
    expect(s.characterizationTestPaths).toEqual([]);
    expect(s.incrementsApplied).toEqual([]);
  });
});

describe('refactor transition', () => {
  it('start moves pending → in_progress at contract', () => {
    const s = createRefactorState('RUN-001', 'REFACTOR-001');
    const r = transition(s, 'start', { now: fixedClock });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe('in_progress');
  });

  it('INVARIANT: cannot advance to incremental-refactor without characterization tests', () => {
    // Advance from contract to discover-deps, then to characterization-tests,
    // then to target-structure, then to identify-patterns — at this point
    // characterizationTestPaths is still empty.
    let s = { ...createRefactorState('RUN-001', 'REFACTOR-001'), status: 'in_progress' } as const;
    for (const _stage of [
      'discover-deps',
      'characterization-tests',
      'target-structure',
      'identify-patterns',
    ]) {
      const r = transition(s, 'advance', { now: fixedClock });
      expect(r.ok).toBe(true);
      if (r.ok) s = r.value;
    }
    expect(s.stage).toBe('identify-patterns');
    // Attempt to advance to incremental-refactor without characterization tests.
    const r = transition(s, 'advance', { now: fixedClock });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('POLICY_VIOLATION');
  });

  it('CAN advance to incremental-refactor when characterization tests exist', () => {
    const s = {
      ...createRefactorState('RUN-001', 'REFACTOR-001'),
      status: 'in_progress',
      stage: 'identify-patterns',
      characterizationTestPaths: ['tests/invoice.test.ts'],
    } as const;
    const r = transition(s, 'advance', { now: fixedClock });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.stage).toBe('incremental-refactor');
  });

  it('advance advances through all stages when characterization tests exist', () => {
    let s = {
      ...createRefactorState('RUN-001', 'REFACTOR-001'),
      status: 'in_progress',
      characterizationTestPaths: ['tests/x.test.ts'],
    } as const;
    const expected = [
      'discover-deps',
      'characterization-tests',
      'target-structure',
      'identify-patterns',
      'incremental-refactor',
      'contract-validation',
      'regression-testing',
      'quality-comparison',
      'review',
    ];
    for (const _nextStage of expected) {
      const r = transition(s, 'advance', { now: fixedClock });
      expect(r.ok).toBe(true);
      if (r.ok) s = r.value;
    }
    expect(s.stage).toBe('review');
  });

  it('complete from review moves to completed', () => {
    const s = {
      ...createRefactorState('RUN-001', 'REFACTOR-001'),
      status: 'in_progress',
      stage: 'review',
    } as const;
    const r = transition(s, 'complete', { now: fixedClock });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe('completed');
  });

  it('INVARIANT: complete is only allowed from the review stage', () => {
    const s = {
      ...createRefactorState('RUN-001', 'REFACTOR-001'),
      status: 'in_progress',
      stage: 'quality-comparison',
    } as const;
    const r = transition(s, 'complete', { now: fixedClock });
    expect(r.ok).toBe(false);
  });
});

describe('refactor canTransition and isTerminal', () => {
  it('allows start only from pending', () => {
    expect(canTransition('pending', 'start')).toBe(true);
    expect(canTransition('in_progress', 'start')).toBe(false);
  });
  it('terminals', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('in_progress')).toBe(false);
  });
});
