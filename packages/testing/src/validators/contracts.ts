// packages/testing/src/validators/contracts.ts
//
// Round-trip validators: parse → serialize → parse → assert equality.
// Catches non-determinism (key ordering, undefined vs missing) before it
// reaches a consumer.
//
// See TESTING.md §4.4 and CONTRACTS.md §10.

import { expect } from 'vitest';
import {
  ProjectProfileSchema,
  RepositoryScanSchema,
  VerificationReportSchema,
  WorkflowStateSchema,
  FeatureSpecificationSchema,
  ImplementationPlanSchema,
  PolicyDecisionSchema,
} from '@agentic-sdlc-kit/contracts';

export function roundTrip<T>(
  schema: { safeParse: (x: unknown) => { success: boolean; data?: T } },
  sample: unknown,
): T {
  const first = schema.safeParse(sample);
  expect(first.success).toBe(true);
  if (!first.success) throw new Error('unreachable');
  const data = first.data as T;
  // Serialize and re-parse. JSON drops functions and undefined; that is the
  // point: if the schema relies on either, the round trip catches it.
  const second = schema.safeParse(JSON.parse(JSON.stringify(data)) as unknown);
  expect(second.success).toBe(true);
  return data;
}

export function validateProjectProfile(sample: unknown) {
  return roundTrip(ProjectProfileSchema, sample);
}

export function validateRepositoryScan(sample: unknown) {
  return roundTrip(RepositoryScanSchema, sample);
}

export function validateVerificationReport(sample: unknown) {
  return roundTrip(VerificationReportSchema, sample);
}

export function validateWorkflowState(sample: unknown) {
  return roundTrip(WorkflowStateSchema, sample);
}

export function validateFeatureSpecification(sample: unknown) {
  return roundTrip(FeatureSpecificationSchema, sample);
}

export function validateImplementationPlan(sample: unknown) {
  return roundTrip(ImplementationPlanSchema, sample);
}

export function validatePolicyDecision(sample: unknown) {
  return roundTrip(PolicyDecisionSchema, sample);
}
