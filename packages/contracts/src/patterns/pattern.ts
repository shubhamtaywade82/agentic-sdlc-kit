// packages/contracts/src/patterns/pattern.ts
//
// M14 pattern catalog contract (M14-08). Language-independent design
// pattern documentation. Patterns are documented once as concepts, then
// linked to implementation examples in stack packs.
//
// Per the architecture proposal §7: every pattern must explain when it
// applies, when it does not, and the simpler alternative.

import { z } from 'zod';

export const PATTERN_SCHEMA_VERSION = 1 as const;

export const PatternCategorySchema = z.enum([
  'architecture',
  'creational',
  'structural',
  'behavioral',
  'resilience',
  'data',
  'testing',
]);

export const PatternExampleSchema = z.object({
  stack: z.string().min(1),
  // Path within the stack pack where the example lives.
  path: z.string().min(1),
});

export const PatternSchema = z.object({
  schemaVersion: z.literal(PATTERN_SCHEMA_VERSION),
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'pattern id must be kebab-case'),
  name: z.string().min(1),
  category: PatternCategorySchema,
  // The design problem this pattern addresses.
  problem: z.string().min(1),
  // Conditions that justify introducing it.
  whenToUse: z.array(z.string()).min(1),
  // Conditions that argue against it.
  whenNotToUse: z.array(z.string()).min(1),
  // Simpler alternatives that should be considered first.
  simplerAlternatives: z.array(z.string()).min(1),
  // Participants and responsibilities.
  structure: z.string().min(1),
  // What additional complexity the pattern introduces.
  tradeOffs: z.array(z.string()),
  // Implementation examples in specific stacks.
  examples: z.array(PatternExampleSchema).default([]),
  // How to prove the implementation works.
  testingStrategy: z.string().min(1),
  // Alternative and complementary patterns.
  relatedPatterns: z.array(z.string()).default([]),
  // Common misuse.
  antiPatterns: z.array(z.string()).default([]),
});

export type PatternCategory = z.infer<typeof PatternCategorySchema>;
export type PatternExample = z.infer<typeof PatternExampleSchema>;
export type Pattern = z.infer<typeof PatternSchema>;

/**
 * Pattern selection question (used by the design-pattern-selection Skill).
 * Every proposed pattern must answer all five questions (per architecture
 * proposal §7).
 */
export const PatternSelectionQuestionSchema = z.object({
  patternId: z.string(),
  // 1. What specific problem exists?
  problem: z.string().min(1),
  // 2. Why is the current design insufficient?
  currentDesignInsufficiency: z.string().min(1),
  // 3. What simpler alternative was considered?
  simplerAlternativeConsidered: z.string().min(1),
  // 4. What complexity will the pattern introduce?
  complexityIntroduced: z.string().min(1),
  // 5. How will the implementation be tested?
  testingApproach: z.string().min(1),
});

export type PatternSelectionQuestion = z.infer<typeof PatternSelectionQuestionSchema>;
