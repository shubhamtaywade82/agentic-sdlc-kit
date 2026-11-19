// packages/contracts/src/maintenance/refactor-contract.ts
//
// Refactoring contract (M9 — M9-11, M9-12).
//
// A refactor contract captures the structural-change specification: what
// is being refactored, the target structure, and the public contracts that
// MUST be preserved.
//
// INVARIANT (post-M7 roadmap §3.2): preserve observable behavior unless
// behavior changes are explicitly approved. The contract's
// `behaviorChangeApproved` field defaults to false; if any change
// modifies public behavior, it must be set to true with rationale.

import { z } from 'zod';

export const RefactorGoalSchema = z.enum([
  'reduce-coupling',
  'improve-testability',
  'improve-readability',
  'extract-module',
  'extract-component',
  'simplify-control-flow',
  'introduce-pattern',
  'remove-dead-code',
  'modernize-syntax',
  'other',
]);

export const PublicContractSchema = z.object({
  id: z.string(),
  // API surface, data shape, observable side effect, etc.
  kind: z.enum(['api-endpoint', 'function-signature', 'data-shape', 'cli', 'event', 'side-effect']),
  description: z.string().min(1),
  // The characterization test that pins this contract.
  characterizationTestPath: z.string().optional(),
});

export const RefactorContractSchema = z
  .object({
    id: z.string().regex(/^[A-Z]+-[0-9]{3,}$/, 'id must match REFACTOR-NNN'),
    title: z.string().min(1).max(200),
    targetModule: z.string().min(1),
    goal: RefactorGoalSchema,
    targetStructure: z.string().min(1),
    rationale: z.string().min(1),
    // The public contracts that MUST be preserved.
    publicContracts: z.array(PublicContractSchema).min(1, 'at least one public contract required'),
    // Candidate design patterns (with justification per post-M7 §3.2:
    // "Do not use a design pattern simply because it exists").
    candidatePatterns: z
      .array(
        z.object({
          pattern: z.string(),
          whyItApplies: z.string().min(1),
          whenNotToUse: z.string().min(1),
          simplerAlternative: z.string().min(1),
        }),
      )
      .default([]),
    // Default false. If true, the refactor is allowed to change observable
    // behavior; the rationale MUST be present.
    behaviorChangeApproved: z.boolean().default(false),
    behaviorChangeRationale: z.string().optional(),
    // Files / modules in scope.
    inScopePaths: z.array(z.string()),
    // Files / modules explicitly out of scope.
    outOfScopePaths: z.array(z.string()).default([]),
  })
  .strict()
  .refine(
    (c) => !c.behaviorChangeApproved || c.behaviorChangeRationale,
    'behaviorChangeApproved=true requires behaviorChangeRationale',
  );

export type RefactorGoal = z.infer<typeof RefactorGoalSchema>;
export type PublicContract = z.infer<typeof PublicContractSchema>;
export type RefactorContract = z.infer<typeof RefactorContractSchema>;
