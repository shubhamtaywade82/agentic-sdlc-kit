// packages/contracts/src/product/product-brief.ts
//
// Product brief contract (M8 Phase B — M8-06, M8-07).
//
// Captures the developer's product idea and the kit's analysis of the
// problem and users. The brief is the input to the requirements engine.
//
// INVARIANT (post-M7 roadmap §2.3 Phase B): the kit must NOT silently
// invent business rules when the developer provides an incomplete product
// idea. Assumptions are recorded and flagged as decisions requiring
// approval.

import { z } from 'zod';

export const ProductBriefSchema = z
  .object({
    id: z.string().regex(/^[A-Z]+-[0-9]{3,}$/, 'id must match BRIEF-NNN'),
    title: z.string().min(1).max(200),
    description: z.string().min(1),
    problemStatement: z.string().min(1),
    targetUsers: z
      .array(
        z.object({
          name: z.string().min(1),
          role: z.string().min(1),
          need: z.string().min(1),
        }),
      )
      .min(1, 'at least one target user is required'),
    businessGoals: z.array(z.string().min(1)),
    assumptions: z
      .array(
        z.object({
          id: z.string(),
          assumption: z.string().min(1),
          requiresApproval: z.boolean(),
        }),
      )
      .default([]),
    unresolvedDecisions: z
      .array(
        z.object({
          id: z.string(),
          question: z.string().min(1),
          blocking: z.boolean(),
        }),
      )
      .default([]),
    outOfScope: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type ProductBrief = z.infer<typeof ProductBriefSchema>;
