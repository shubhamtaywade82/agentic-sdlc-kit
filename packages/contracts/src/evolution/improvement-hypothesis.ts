// packages/contracts/src/evolution/improvement-hypothesis.ts
//
// M31 improvement hypothesis (RESEARCH.md §6). Every proposed improvement
// must describe a measurable problem and a testable solution.
//
// The engine is also allowed to recommend doing nothing.

import { z } from 'zod';

export const HYPOTHESIS_SCHEMA_VERSION = 1 as const;

export const ImprovementCategorySchema = z.enum([
  'knowledge',
  'skill',
  'agent',
  'workflow',
  'script',
  'pattern',
  'routing',
  'core',
  'security',
]);

export const ImprovementHypothesisSchema = z.object({
  schemaVersion: z.literal(HYPOTHESIS_SCHEMA_VERSION),
  id: z.string().regex(/^[A-Z]+-[0-9]{3,}$/, 'id must match EVO-NNN'),
  title: z.string().min(1),
  category: ImprovementCategorySchema,
  // The observed problem (with evidence).
  observedProblem: z.string().min(1),
  // The episodes that evidence the problem.
  evidenceEpisodeIds: z.array(z.string()).min(1),
  // The hypothesis: what change might fix the problem.
  hypothesis: z.string().min(1),
  // The proposed change (file paths, content, etc.).
  proposedChange: z.string().min(1),
  // The success metric that would confirm the improvement.
  successMetric: z.object({
    metric: z.string().min(1),
    // The threshold the candidate must beat.
    threshold: z.number(),
    direction: z.enum(['higher-is-better', 'lower-is-better']),
  }),
  // Guardrails: things the candidate must NOT regress.
  guardrails: z
    .array(
      z.object({
        metric: z.string().min(1),
        threshold: z.number(),
        direction: z.enum(['higher-is-better', 'lower-is-better']),
      }),
    )
    .default([]),
  // Estimated impact, cost, and risk (for prioritization).
  estimatedImpact: z.enum(['low', 'medium', 'high']),
  estimatedCost: z.enum(['low', 'medium', 'high']),
  estimatedRisk: z.enum(['low', 'medium', 'high']),
  // Priority score (higher = more important to attempt).
  priorityScore: z.number().min(0),
  status: z
    .enum(['proposed', 'experimenting', 'approved', 'rejected', 'needs-revision'])
    .default('proposed'),
  createdAt: z.string(),
});

export type ImprovementCategory = z.infer<typeof ImprovementCategorySchema>;
export type ImprovementHypothesis = z.infer<typeof ImprovementHypothesisSchema>;
