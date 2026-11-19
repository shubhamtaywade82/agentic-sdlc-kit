// packages/contracts/src/product/product-brief.test.ts
import { describe, expect, it } from 'vitest';
import { ProductBriefSchema } from './product-brief.js';
import { RequirementsDocumentSchema } from './requirements.js';
import { MvpScopeSchema } from './mvp-scope.js';
import { TraceabilityMatrixSchema } from './traceability.js';

const validBrief = {
  id: 'BRIEF-001',
  title: 'Project Management App',
  description: 'A subscription-based project management application.',
  problemStatement: 'Teams lack a lightweight project management tool.',
  targetUsers: [{ name: 'PM', role: 'manager', need: 'track tasks' }],
  businessGoals: ['reduce onboarding time'],
  assumptions: [{ id: 'A-1', assumption: 'users have email', requiresApproval: false }],
  unresolvedDecisions: [{ id: 'Q-1', question: 'billing provider?', blocking: true }],
  outOfScope: ['mobile app'],
};

describe('ProductBriefSchema', () => {
  it('accepts a valid brief', () => {
    expect(ProductBriefSchema.safeParse(validBrief).success).toBe(true);
  });
  it('rejects an invalid id', () => {
    expect(ProductBriefSchema.safeParse({ ...validBrief, id: 'brief-1' }).success).toBe(false);
  });
  it('rejects a brief with no target users', () => {
    expect(ProductBriefSchema.safeParse({ ...validBrief, targetUsers: [] }).success).toBe(false);
  });
  it('rejects unknown top-level keys (.strict())', () => {
    expect(ProductBriefSchema.safeParse({ ...validBrief, bogus: true }).success).toBe(false);
  });
});

const validDoc = {
  schemaVersion: 1,
  briefId: 'BRIEF-001',
  functional: [
    {
      id: 'FR-1',
      kind: 'functional',
      statement: 'Users can create projects.',
      priority: 'must',
      source: 'BRIEF-001',
      acceptanceCriterionIds: ['AC-1'],
    },
  ],
  nonFunctional: [],
  business: [],
  technicalConstraints: [],
  assumptions: [],
};

describe('RequirementsDocumentSchema', () => {
  it('accepts a valid doc', () => {
    expect(RequirementsDocumentSchema.safeParse(validDoc).success).toBe(true);
  });
  it('rejects an invalid priority', () => {
    expect(
      RequirementsDocumentSchema.safeParse({
        ...validDoc,
        functional: [{ ...validDoc.functional[0], priority: 'maybe' }],
      }).success,
    ).toBe(false);
  });
});

describe('MvpScopeSchema', () => {
  it('accepts a valid scope', () => {
    expect(
      MvpScopeSchema.safeParse({
        schemaVersion: 1,
        briefId: 'BRIEF-001',
        inScopeRequirementIds: ['FR-1'],
        outOfScopeRequirementIds: [],
        releaseBoundary: 'mvp',
        rationale: 'MVP focuses on core project management.',
      }).success,
    ).toBe(true);
  });
});

describe('TraceabilityMatrixSchema', () => {
  it('accepts a valid matrix', () => {
    expect(
      TraceabilityMatrixSchema.safeParse({
        schemaVersion: 1,
        briefId: 'BRIEF-001',
        entries: [
          {
            requirementId: 'FR-1',
            acceptanceCriterionIds: ['AC-1'],
            taskIds: ['TASK-001'],
          },
        ],
      }).success,
    ).toBe(true);
  });
  it('rejects an entry with no acceptance criteria', () => {
    expect(
      TraceabilityMatrixSchema.safeParse({
        schemaVersion: 1,
        briefId: 'BRIEF-001',
        entries: [{ requirementId: 'FR-1', acceptanceCriterionIds: [], taskIds: [] }],
      }).success,
    ).toBe(false);
  });
});
