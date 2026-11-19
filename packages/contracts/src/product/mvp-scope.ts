// packages/contracts/src/product/mvp-scope.ts
//
// MVP scope definition (M8 Phase B — M8-10).
//
// Records what is in the MVP and what is explicitly out of scope. The
// boundary is enforced: tasks in the implementation plan MUST trace to an
// MVP-scoped requirement; tasks that trace to out-of-scope requirements
// are rejected by the plan validator.

import { z } from 'zod';

export const MvpScopeSchema = z.object({
  schemaVersion: z.literal(1),
  briefId: z.string(),
  inScopeRequirementIds: z.array(z.string()),
  outOfScopeRequirementIds: z.array(z.string()),
  releaseBoundary: z.enum(['mvp', 'post-mvp', 'future']),
  rationale: z.string().min(1),
});

export type MvpScope = z.infer<typeof MvpScopeSchema>;
