// packages/contracts/src/index.test.ts
//
// Smoke test that proves:
//   1. Every public symbol is exported from the barrel.
//   2. The package has no internal cycle (imports resolve without error).
//
// This is the contract-test referenced in TESTING.md §4.1.

import { describe, expect, it } from 'vitest';
import * as contracts from './index.js';

describe('contracts barrel', () => {
  it('exports the common surface', () => {
    expect(typeof contracts.ok).toBe('function');
    expect(typeof contracts.err).toBe('function');
    expect(typeof contracts.Errors).toBe('object');
    expect(typeof contracts.IdentifierSchema).toBe('object');
    expect(typeof contracts.isValidIdentifier).toBe('function');
  });

  it('exports the project surface', () => {
    expect(typeof contracts.ProjectProfileSchema).toBe('object');
    expect(typeof contracts.RepositoryScanSchema).toBe('object');
    expect(contracts.PROJECT_PROFILE_SCHEMA_VERSION).toBe(1);
  });

  it('exports the workflow surface', () => {
    expect(typeof contracts.WorkflowModeSchema).toBe('object');
    expect(typeof contracts.WorkflowStatusSchema).toBe('object');
    expect(typeof contracts.WorkflowStateSchema).toBe('object');
  });

  it('exports the specification surface', () => {
    expect(typeof contracts.FeatureSpecificationSchema).toBe('object');
    expect(typeof contracts.BddScenarioSchema).toBe('object');
  });

  it('exports the planning surface', () => {
    expect(typeof contracts.TaskSchema).toBe('object');
    expect(typeof contracts.ImplementationPlanSchema).toBe('object');
  });

  it('exports the verification surface', () => {
    expect(typeof contracts.VerificationReportSchema).toBe('object');
    expect(typeof contracts.rollupReportStatus).toBe('function');
    expect(contracts.VERIFICATION_REPORT_SCHEMA_VERSION).toBe(1);
  });

  it('exports the policy surface', () => {
    expect(typeof contracts.PolicyDecisionSchema).toBe('object');
    expect(typeof contracts.PolicyActionSchema).toBe('object');
    expect(typeof contracts.ApprovalSchema).toBe('object');
  });
});
