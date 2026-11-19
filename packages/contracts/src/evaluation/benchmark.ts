// packages/contracts/src/evaluation/benchmark.ts
//
// M19 evaluation contract (M19-01) and benchmark suite (M19-02). The kit
// evaluates itself against a stable benchmark set per RESEARCH.md §13 and
// the post-M7 §13 roadmap.

import { z } from 'zod';

export const EVALUATION_SCHEMA_VERSION = 1 as const;

export const BenchmarkKindSchema = z.enum([
  'feature',
  'bug-fix',
  'refactor',
  'greenfield',
  'security',
]);

export const BenchmarkCaseSchema = z.object({
  id: z.string().regex(/^[A-Z]+-[0-9]{3,}$/),
  title: z.string().min(1),
  kind: BenchmarkKindSchema,
  // The fixture repository to run against.
  fixture: z.string().min(1),
  // The task description given to the kit.
  taskPrompt: z.string().min(1),
  // The acceptance criteria the result must satisfy.
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  // Whether this case is held-out (not used during improvement experiments).
  heldOut: z.boolean().default(false),
});

export const BenchmarkSuiteSchema = z.object({
  schemaVersion: z.literal(EVALUATION_SCHEMA_VERSION),
  id: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver'),
  cases: z.array(BenchmarkCaseSchema),
});

export type BenchmarkKind = z.infer<typeof BenchmarkKindSchema>;
export type BenchmarkCase = z.infer<typeof BenchmarkCaseSchema>;
export type BenchmarkSuite = z.infer<typeof BenchmarkSuiteSchema>;
