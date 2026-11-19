// packages/contracts/src/application/application-state.test.ts
import { describe, expect, it } from 'vitest';
import { ApplicationStateSchema } from './application-state.js';
import {
  COMPLETABLE_STAGES,
  STAGE_ORDER,
  TARGET_STATUS,
  TRANSITIONS_BY_STATUS,
  revisableFrom,
} from './application-transitions.js';

describe('ApplicationStateSchema', () => {
  it('accepts a fresh pending state at the intake stage', () => {
    const r = ApplicationStateSchema.safeParse({
      schemaVersion: 1,
      runId: 'RUN-001',
      status: 'pending',
      stage: 'intake',
      stageHistory: [],
      revisions: [],
    });
    expect(r.success).toBe(true);
  });
  it('rejects an unknown stage', () => {
    const r = ApplicationStateSchema.safeParse({
      schemaVersion: 1,
      runId: 'RUN-001',
      status: 'pending',
      stage: 'bogus',
      stageHistory: [],
      revisions: [],
    });
    expect(r.success).toBe(false);
  });
  it('rejects an unknown status', () => {
    const r = ApplicationStateSchema.safeParse({
      schemaVersion: 1,
      runId: 'RUN-001',
      status: 'paused',
      stage: 'intake',
      stageHistory: [],
      revisions: [],
    });
    expect(r.success).toBe(false);
  });
});

describe('STAGE_ORDER', () => {
  it('lists all 10 stages in canonical order', () => {
    expect(STAGE_ORDER).toEqual([
      'intake',
      'discovery',
      'requirements',
      'architecture',
      'planning',
      'scaffolding',
      'implementation',
      'verification',
      'review',
      'release',
    ]);
  });
});

describe('TRANSITIONS_BY_STATUS', () => {
  it('allows start only from pending', () => {
    expect(TRANSITIONS_BY_STATUS.pending).toEqual(['start']);
  });
  it('allows advance/block/complete/fail/revise from in_progress', () => {
    expect(TRANSITIONS_BY_STATUS.in_progress).toContain('advance');
    expect(TRANSITIONS_BY_STATUS.in_progress).toContain('block');
    expect(TRANSITIONS_BY_STATUS.in_progress).toContain('complete');
    expect(TRANSITIONS_BY_STATUS.in_progress).toContain('fail');
    expect(TRANSITIONS_BY_STATUS.in_progress).toContain('revise');
  });
  it('makes completed and failed terminal', () => {
    expect(TRANSITIONS_BY_STATUS.completed).toEqual([]);
    expect(TRANSITIONS_BY_STATUS.failed).toEqual([]);
  });
});

describe('TARGET_STATUS', () => {
  it('maps every transition to a status', () => {
    expect(TARGET_STATUS.start).toBe('in_progress');
    expect(TARGET_STATUS.advance).toBe('in_progress');
    expect(TARGET_STATUS.block).toBe('blocked');
    expect(TARGET_STATUS.resume).toBe('in_progress');
    expect(TARGET_STATUS.complete).toBe('completed');
    expect(TARGET_STATUS.fail).toBe('failed');
    expect(TARGET_STATUS.revise).toBe('in_progress');
  });
});

describe('COMPLETABLE_STAGES', () => {
  it('only allows complete from the release stage', () => {
    expect(COMPLETABLE_STAGES).toEqual(['release']);
  });
});

describe('revisableFrom', () => {
  it('returns all prior stages for a given stage', () => {
    expect(revisableFrom('architecture')).toEqual(['intake', 'discovery', 'requirements']);
  });
  it('returns an empty array for the first stage', () => {
    expect(revisableFrom('intake')).toEqual([]);
  });
});
