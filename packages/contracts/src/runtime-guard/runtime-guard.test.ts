// packages/contracts/src/runtime-guard/runtime-guard.test.ts
import { describe, expect, it } from 'vitest';
import {
  ActionCategorySchema,
  ClassifiedActionSchema,
  isDestructive,
  isProduction,
} from './action-classification.js';
import { PolicyPackSchema, PolicyRuleSchema } from './policy-schema.js';
import { AuditEventSchema } from './audit-event.js';

describe('ActionCategorySchema', () => {
  it('accepts known categories', () => {
    expect(ActionCategorySchema.safeParse('file.delete').success).toBe(true);
    expect(ActionCategorySchema.safeParse('db.migrate').success).toBe(true);
    expect(ActionCategorySchema.safeParse('git.force-push').success).toBe(true);
    expect(ActionCategorySchema.safeParse('release.deploy').success).toBe(true);
  });
  it('rejects unknown categories', () => {
    expect(ActionCategorySchema.safeParse('file.rename').success).toBe(false);
    expect(ActionCategorySchema.safeParse('db.vacuum').success).toBe(false);
  });
});

describe('ClassifiedActionSchema', () => {
  const action = {
    category: 'file.delete',
    impact: 'local',
    scope: { fileCount: 1, paths: ['src/x.ts'] },
  };
  it('accepts a valid action', () => {
    expect(ClassifiedActionSchema.safeParse(action).success).toBe(true);
  });
});

describe('isDestructive', () => {
  it('flags file.delete as destructive', () => {
    expect(isDestructive({ category: 'file.delete', impact: 'local', scope: {} })).toBe(true);
  });
  it('does NOT flag file.read as destructive', () => {
    expect(isDestructive({ category: 'file.read', impact: 'none', scope: {} })).toBe(false);
  });
  it('flags release.deploy as destructive', () => {
    expect(isDestructive({ category: 'release.deploy', impact: 'production', scope: {} })).toBe(
      true,
    );
  });
});

describe('isProduction', () => {
  it('flags production-impact actions', () => {
    expect(isProduction({ category: 'release.deploy', impact: 'production', scope: {} })).toBe(
      true,
    );
  });
  it('flags db.mutate-production regardless of impact field', () => {
    expect(isProduction({ category: 'db.mutate-production', impact: 'local', scope: {} })).toBe(
      true,
    );
  });
  it('does NOT flag local-only actions', () => {
    expect(isProduction({ category: 'file.create', impact: 'local', scope: {} })).toBe(false);
  });
});

describe('PolicyRuleSchema', () => {
  it('accepts a rule with a threshold', () => {
    expect(
      PolicyRuleSchema.safeParse({
        id: 'R-1',
        category: 'file.delete',
        impact: 'local',
        verdict: 'require-approval',
        threshold: { field: 'fileCount', op: 'gt', value: 5 },
        reason: 'bulk deletes need approval',
      }).success,
    ).toBe(true);
  });
  it('accepts a wildcard rule', () => {
    expect(
      PolicyRuleSchema.safeParse({
        id: 'R-default',
        category: '*',
        impact: '*',
        verdict: 'require-approval',
        reason: 'default deny-soft',
      }).success,
    ).toBe(true);
  });
});

describe('PolicyPackSchema', () => {
  it('accepts a valid pack', () => {
    expect(
      PolicyPackSchema.safeParse({
        schemaVersion: 1,
        id: 'default',
        version: '1.0.0',
        name: 'Default Policy',
        description: 'Baseline guardrails.',
        rules: [],
        defaultVerdict: 'require-approval',
        appliesNonInteractive: false,
      }).success,
    ).toBe(true);
  });
});

describe('AuditEventSchema', () => {
  it('accepts a deny event', () => {
    expect(
      AuditEventSchema.safeParse({
        schemaVersion: 1,
        id: 'AE-1',
        at: '2026-01-01T00:00:00.000Z',
        action: {
          category: 'git.force-push',
          impact: 'shared-branch',
          scopeSummary: 'branch=main',
        },
        verdict: 'deny',
        outcome: 'denied',
      }).success,
    ).toBe(true);
  });
  it('accepts an approved event', () => {
    expect(
      AuditEventSchema.safeParse({
        schemaVersion: 1,
        id: 'AE-2',
        at: '2026-01-01T00:00:00.000Z',
        action: {
          category: 'db.migrate',
          impact: 'local',
          scopeSummary: 'env=dev',
        },
        verdict: 'require-approval',
        approval: {
          approver: 'lead',
          grantedAt: '2026-01-01T00:00:01.000Z',
          rationale: 'approved in standup',
        },
        outcome: 'executed',
      }).success,
    ).toBe(true);
  });
});
