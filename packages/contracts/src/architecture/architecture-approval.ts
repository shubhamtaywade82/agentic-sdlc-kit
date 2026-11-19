// packages/contracts/src/architecture/architecture-approval.ts
//
// Architecture approval contract (M8 Phase C — M8-19).
//
// Once an architecture option is selected, the kit freezes the design
// baseline as a set of ADR references. Any subsequent revision must go
// through `revise` transition and produce a new ADR.

import { z } from 'zod';

export const ArchitectureApprovalSchema = z.object({
  schemaVersion: z.literal(1),
  briefId: z.string(),
  selectedOptionId: z.string(),
  // ADR IDs that document the approved decisions.
  adrIds: z.array(z.string()),
  // References to the architecture sub-artifacts.
  componentMapId: z.string(),
  dataModelId: z.string(),
  apiContractId: z.string(),
  securityDesignId: z.string(),
  operationalDesignId: z.string(),
  approvedBy: z.string(),
  approvedAt: z.string(),
});

export type ArchitectureApproval = z.infer<typeof ArchitectureApprovalSchema>;
