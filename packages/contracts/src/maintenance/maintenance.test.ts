// packages/contracts/src/maintenance/maintenance.test.ts
import { describe, expect, it } from 'vitest';
import { BugReportSchema } from './bug-report.js';
import {
  BUG_FIX_STAGE_ORDER,
  BUG_FIX_TRANSITIONS_BY_STATUS,
  regressionTestRequiredBeforeFix,
} from './bug-fix-workflow.js';
import { RefactorContractSchema } from './refactor-contract.js';
import {
  REFACTOR_STAGE_ORDER,
  REFACTOR_TRANSITIONS_BY_STATUS,
  characterizationRequiredBeforeRefactor,
} from './refactor-workflow.js';
import { PerformanceProblemSchema } from './performance-baseline.js';

const validBug = {
  id: 'BUG-001',
  title: 'Duplicate invoices on webhook retry',
  description: 'When the payment provider sends the same webhook twice, two invoices are created.',
  reportedAt: '2026-01-01T00:00:00.000Z',
  reportedBy: 'user',
  category: 'functional',
  severity: 'high',
  reportedSteps: ['send webhook', 'resend same webhook'],
  expectedBehavior: 'Only one invoice per payment.',
  actualBehavior: 'Two invoices are created.',
  environment: [],
};

describe('BugReportSchema', () => {
  it('accepts a valid report', () => {
    expect(BugReportSchema.safeParse(validBug).success).toBe(true);
  });
  it('defaults reproductionStatus to not-attempted', () => {
    const r = BugReportSchema.safeParse(validBug);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reproductionStatus).toBe('not-attempted');
  });
  it('rejects an invalid category', () => {
    expect(BugReportSchema.safeParse({ ...validBug, category: 'weird' }).success).toBe(false);
  });
});

describe('BugFixStage order and transitions', () => {
  it('lists the 10 stages in canonical order', () => {
    expect(BUG_FIX_STAGE_ORDER).toEqual([
      'report',
      'discovery',
      'reproduction',
      'root-cause',
      'regression-test',
      'minimal-fix',
      'focused-verify',
      'regression-verify',
      'review',
      'completion',
    ]);
  });
  it('only allows start from pending', () => {
    expect(BUG_FIX_TRANSITIONS_BY_STATUS.pending).toEqual(['start']);
  });
  it('makes completed and failed terminal', () => {
    expect(BUG_FIX_TRANSITIONS_BY_STATUS.completed).toEqual([]);
    expect(BUG_FIX_TRANSITIONS_BY_STATUS.failed).toEqual([]);
  });
});

describe('regressionTestRequiredBeforeFix invariant', () => {
  it('flags an attempt to enter minimal-fix from a non-regression-test stage', () => {
    expect(regressionTestRequiredBeforeFix('root-cause', 'minimal-fix')).toBe(true);
  });
  it('does NOT flag entering minimal-fix from regression-test', () => {
    expect(regressionTestRequiredBeforeFix('regression-test', 'minimal-fix')).toBe(false);
  });
  it('does NOT flag other stage transitions', () => {
    expect(regressionTestRequiredBeforeFix('report', 'discovery')).toBe(false);
  });
});

const validRefactor = {
  id: 'REFACTOR-001',
  title: 'Reduce coupling in invoice module',
  targetModule: 'src/invoice',
  goal: 'reduce-coupling',
  targetStructure: 'Extract InvoiceProcessor service.',
  rationale: 'improve testability',
  publicContracts: [
    {
      id: 'PC-1',
      kind: 'function-signature',
      description: 'processInvoice(paymentId): Invoice',
    },
  ],
  candidatePatterns: [],
  behaviorChangeApproved: false,
  inScopePaths: ['src/invoice'],
  outOfScopePaths: [],
};

describe('RefactorContractSchema', () => {
  it('accepts a valid contract', () => {
    expect(RefactorContractSchema.safeParse(validRefactor).success).toBe(true);
  });
  it('rejects behaviorChangeApproved=true without rationale', () => {
    expect(
      RefactorContractSchema.safeParse({
        ...validRefactor,
        behaviorChangeApproved: true,
      }).success,
    ).toBe(false);
  });
  it('accepts behaviorChangeApproved=true with rationale', () => {
    expect(
      RefactorContractSchema.safeParse({
        ...validRefactor,
        behaviorChangeApproved: true,
        behaviorChangeRationale: 'API spec change approved by team',
      }).success,
    ).toBe(true);
  });
  it('rejects a contract with no public contracts (must have at least one)', () => {
    expect(
      RefactorContractSchema.safeParse({ ...validRefactor, publicContracts: [] }).success,
    ).toBe(false);
  });
});

describe('RefactorStage order and transitions', () => {
  it('lists the 10 stages in canonical order', () => {
    expect(REFACTOR_STAGE_ORDER).toEqual([
      'contract',
      'discover-deps',
      'characterization-tests',
      'target-structure',
      'identify-patterns',
      'incremental-refactor',
      'contract-validation',
      'regression-testing',
      'quality-comparison',
      'review',
    ]);
  });
  it('only allows start from pending', () => {
    expect(REFACTOR_TRANSITIONS_BY_STATUS.pending).toEqual(['start']);
  });
});

describe('characterizationRequiredBeforeRefactor invariant', () => {
  it('flags an attempt to enter incremental-refactor with no characterization tests', () => {
    expect(
      characterizationRequiredBeforeRefactor(
        {
          schemaVersion: 1,
          runId: 'RUN-001',
          refactorId: 'REFACTOR-001',
          status: 'in_progress',
          stage: 'target-structure',
          characterizationTestPaths: [],
          incrementsApplied: [],
        },
        'incremental-refactor',
      ),
    ).toBe(true);
  });
  it('does NOT flag entering incremental-refactor when characterization tests exist', () => {
    expect(
      characterizationRequiredBeforeRefactor(
        {
          schemaVersion: 1,
          runId: 'RUN-001',
          refactorId: 'REFACTOR-001',
          status: 'in_progress',
          stage: 'target-structure',
          characterizationTestPaths: ['tests/invoice.test.ts'],
          incrementsApplied: [],
        },
        'incremental-refactor',
      ),
    ).toBe(false);
  });
});

describe('PerformanceProblemSchema', () => {
  it('accepts a valid problem with baseline and target', () => {
    expect(
      PerformanceProblemSchema.safeParse({
        id: 'PERF-001',
        description: 'Invoice generation is slow.',
        targetOperation: 'POST /invoices',
        baseline: {
          command: ['node', 'bench/invoices.js'],
          metric: 'p95',
          repetitions: 10,
          environment: 'local-mac-m1',
        },
        target: { metric: 'p95', value: 200, unit: 'ms', direction: 'lower-is-better' },
        bottleneckHypothesis: 'N+1 query in invoice items loader.',
      }).success,
    ).toBe(true);
  });
  it('rejects an invalid id', () => {
    expect(
      PerformanceProblemSchema.safeParse({
        id: 'perf-1',
        description: 'x',
        targetOperation: 'x',
        baseline: {
          command: ['x'],
          metric: 'p50',
          repetitions: 1,
          environment: 'x',
        },
        target: { metric: 'x', value: 1, unit: 'ms', direction: 'lower-is-better' },
        bottleneckHypothesis: 'x',
      }).success,
    ).toBe(false);
  });
});
