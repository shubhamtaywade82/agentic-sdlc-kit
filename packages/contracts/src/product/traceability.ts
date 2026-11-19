// packages/contracts/src/product/traceability.ts
//
// Requirement-to-acceptance-to-task traceability (M8 Phase B — M8-11).
//
// Every requirement MUST map to at least one acceptance criterion. Every
// acceptance criterion MUST map to at least one task in the implementation
// plan. The traceability matrix is produced by the requirements engine and
// validated by kit validate-plan (M4) and kit audit (M9+).

import { z } from 'zod';

export const TraceabilityEntrySchema = z.object({
  requirementId: z.string(),
  acceptanceCriterionIds: z.array(z.string()).min(1),
  taskIds: z.array(z.string()),
});

export const TraceabilityMatrixSchema = z.object({
  schemaVersion: z.literal(1),
  briefId: z.string(),
  entries: z.array(TraceabilityEntrySchema),
});

export type TraceabilityEntry = z.infer<typeof TraceabilityEntrySchema>;
export type TraceabilityMatrix = z.infer<typeof TraceabilityMatrixSchema>;
