// packages/contracts/src/maintenance/performance-baseline.ts
//
// Performance optimization contract (M9 optional extension — §3.3).
//
// Declared in 0.6.0; full /kit:optimize workflow lands in a later release.
//
// INVARIANT: performance optimization requires baseline measurements. The
// kit MUST NOT propose an optimization without an established baseline.

import { z } from 'zod';

export const PerformanceProblemSchema = z.object({
  id: z.string().regex(/^[A-Z]+-[0-9]{3,}$/, 'id must match PERF-NNN'),
  description: z.string().min(1),
  targetOperation: z.string().min(1),
  // Reproducible baseline: the command(s) to run and the metric to record.
  baseline: z.object({
    command: z.array(z.string().min(1)).min(1),
    metric: z.enum(['p50', 'p95', 'p99', 'throughput', 'rss', 'heap', 'cpu', 'custom']),
    customMetricName: z.string().optional(),
    repetitions: z.number().int().min(1).max(100),
    environment: z.string().min(1),
  }),
  // Measurable target. Must be a number with a unit.
  target: z.object({
    metric: z.string(),
    value: z.number(),
    unit: z.string(),
    direction: z.enum(['lower-is-better', 'higher-is-better']),
  }),
  // Bottleneck hypothesis, to be validated by profiling.
  bottleneckHypothesis: z.string().min(1),
});

export type PerformanceProblem = z.infer<typeof PerformanceProblemSchema>;
