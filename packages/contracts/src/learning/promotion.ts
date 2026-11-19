// packages/contracts/src/learning/promotion.ts
//
// M33 Controlled Promotion and Rollback contracts.
// Enforces independent verification, human authorization, and reversible rollouts.

import { z } from 'zod';

export const SkillPromotionRequestSchema = z.object({
  id: z.string().min(1),
  hypothesisId: z.string().min(1),
  targetSkill: z.string().min(1),
  branchName: z.string().min(1),
  diffSummary: z.string().min(1),
  status: z.enum(['pending_approval', 'approved', 'rejected', 'rolled_back']),
  approvedBy: z.string().optional(),
  createdAt: z.string().min(1),
});

export type SkillPromotionRequest = z.infer<typeof SkillPromotionRequestSchema>;
