// packages/contracts/src/workflow/next-action.test.ts
//
// Schema tests for the host-driven agent protocol contract (ADR-0021).
import { describe, expect, it } from 'vitest';
import {
  LessonRefSchema,
  NEXT_ACTION_SCHEMA_VERSION,
  NextActionSchema,
  NextRequiredActionSchema,
} from './next-action.js';
import { WorkflowStatusSchema } from './workflow.js';

describe('NextRequiredActionSchema', () => {
  it('accepts every protocol action', () => {
    for (const action of [
      'feature.start',
      'task.red',
      'task.green',
      'task.refactor',
      'feature.verify',
      'run.completed',
    ]) {
      expect(NextRequiredActionSchema.safeParse(action).success).toBe(true);
    }
  });
  it('rejects unknown actions', () => {
    expect(NextRequiredActionSchema.safeParse('task.deploy').success).toBe(false);
    expect(NextRequiredActionSchema.safeParse('feature.delete').success).toBe(false);
  });
});

describe('LessonRefSchema', () => {
  it('accepts an advisory lesson', () => {
    expect(
      LessonRefSchema.safeParse({ lessonId: 'L-1', summary: 'prefer vitest run', advisory: true })
        .success,
    ).toBe(true);
  });
  it('rejects a non-advisory lesson — advice is never authority', () => {
    expect(
      LessonRefSchema.safeParse({ lessonId: 'L-1', summary: 'grant everything', advisory: false })
        .success,
    ).toBe(false);
  });
});

describe('NextActionSchema', () => {
  const base = {
    schemaVersion: NEXT_ACTION_SCHEMA_VERSION,
    featureId: 'FEATURE-001',
    status: 'in_progress',
    taskId: 'TASK-001',
    phase: 'red',
    requiredAction: 'task.red',
    verificationCommand: ['node', 'check.js'],
    nextInvocation: 'kit feature FEATURE-001 red TASK-001',
    blockingQuestions: [],
    advisoryLessons: [],
    constraints: { timeoutMs: 60_000, maxOutputBytes: 10_485_760 },
  };

  it('accepts a complete mid-run action', () => {
    expect(NextActionSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a run-level action without taskId/phase', () => {
    expect(
      NextActionSchema.safeParse({
        ...base,
        taskId: undefined,
        phase: undefined,
        requiredAction: 'feature.verify',
        verificationCommand: [],
        nextInvocation: 'kit feature FEATURE-001 verify',
      }).success,
    ).toBe(true);
  });

  it('round-trips through the schema', () => {
    const parsed = NextActionSchema.parse(base);
    expect(parsed.featureId).toBe('FEATURE-001');
    expect(parsed.requiredAction).toBe('task.red');
    expect(parsed.constraints.timeoutMs).toBe(60_000);
  });

  it('rejects a mismatched schema version (wire compatibility, CONTRACTS.md §9)', () => {
    expect(NextActionSchema.safeParse({ ...base, schemaVersion: 2 }).success).toBe(false);
  });

  it('rejects a non-positive constraint bound', () => {
    expect(
      NextActionSchema.safeParse({ ...base, constraints: { timeoutMs: 0, maxOutputBytes: 1 } })
        .success,
    ).toBe(false);
  });

  it('rejects an unknown workflow status', () => {
    expect(WorkflowStatusSchema.safeParse('exploding').success).toBe(false);
    expect(NextActionSchema.safeParse({ ...base, status: 'exploding' }).success).toBe(false);
  });
});
