// packages/contracts/src/product/requirements.ts
//
// Functional and non-functional requirements (M8 Phase B — M8-08, M8-09).
//
// Distinguishes:
//   - Business requirements (what the business needs).
//   - Functional requirements (what the system does).
//   - Non-functional requirements (security, performance, reliability).
//   - Technical constraints (e.g., must run on PostgreSQL).
//   - Assumptions (carried from the brief; require approval if blocking).
//   - Unresolved decisions.

import { z } from 'zod';

export const RequirementKindSchema = z.enum([
  'business',
  'functional',
  'non-functional',
  'technical-constraint',
  'assumption',
]);

// Named ProductRequirementSchema to avoid collision with the
// specification.ts RequirementSchema (which is a simpler { id, statement }
// used inside FeatureSpecification). This one carries the full M8
// requirements-engineering shape (kind, priority, source, traceability).
export const ProductRequirementSchema = z.object({
  id: z.string(),
  kind: RequirementKindSchema,
  statement: z.string().min(1),
  priority: z.enum(['must', 'should', 'could', 'wont']),
  source: z.string().min(1), // brief id or "inferred"
  acceptanceCriterionIds: z.array(z.string()),
});

export const RequirementsDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    briefId: z.string(),
    functional: z.array(ProductRequirementSchema),
    nonFunctional: z.array(ProductRequirementSchema),
    business: z.array(ProductRequirementSchema),
    technicalConstraints: z.array(ProductRequirementSchema),
    assumptions: z.array(ProductRequirementSchema),
    unresolvedDecisions: z
      .array(
        z.object({
          id: z.string(),
          question: z.string().min(1),
          blocking: z.boolean(),
        }),
      )
      .default([]),
  })
  .strict();

export type RequirementKind = z.infer<typeof RequirementKindSchema>;
export type ProductRequirement = z.infer<typeof ProductRequirementSchema>;
export type RequirementsDocument = z.infer<typeof RequirementsDocumentSchema>;
