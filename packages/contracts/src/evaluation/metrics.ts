// packages/contracts/src/evaluation/metrics.ts
//
// M19 metrics and evaluation report (M19-11, M19-12). Every meaningful
// change to workflow logic, model routing, or runtime behavior can be
// evaluated against a stable benchmark set.

import { z } from 'zod';

export const MetricSnapshotSchema = z.object({
  // The metric name (e.g., "acceptance-criteria-pass-rate").
  metric: z.string().min(1),
  // The measured value.
  value: z.number(),
  // The unit (e.g., "%", "ms", "count", "tokens").
  unit: z.string().min(1),
  // The number of benchmark cases this was averaged over.
  sampleSize: z.number().int().positive(),
  // Whether this metric is a primary quality gate (a failure here blocks
  // release regardless of other metrics).
  blocking: z.boolean().default(false),
});

export const EvaluationReportSchema = z.object({
  schemaVersion: z.literal(1),
  // The kit version that was evaluated.
  kitVersion: z.string().min(1),
  // The benchmark suite id + version.
  benchmarkSuiteId: z.string(),
  benchmarkSuiteVersion: z.string(),
  // When the evaluation ran.
  ranAt: z.string(),
  // The metrics measured.
  metrics: z.array(MetricSnapshotSchema),
  // Whether the overall result passes the release quality thresholds.
  passesReleaseGates: z.boolean(),
  // Any blocking failures (critical security regressions, etc.).
  blockingFailures: z
    .array(
      z.object({
        metric: z.string(),
        value: z.number(),
        threshold: z.number(),
        severity: z.enum(['high', 'critical']),
      }),
    )
    .default([]),
});

export type MetricSnapshot = z.infer<typeof MetricSnapshotSchema>;
export type EvaluationReport = z.infer<typeof EvaluationReportSchema>;

/**
 * Compare two evaluation reports (e.g., baseline vs candidate) and produce
 * a delta. Used by the evolution engine (M34) to decide whether a
 * candidate improvement is actually better.
 */
export const ComparisonReportSchema = z.object({
  schemaVersion: z.literal(1),
  baseline: z.string(), // kit version
  candidate: z.string(), // kit version
  metricDeltas: z.array(
    z.object({
      metric: z.string(),
      baselineValue: z.number(),
      candidateValue: z.number(),
      delta: z.number(),
      // Whether the candidate improved on this metric.
      improved: z.boolean(),
    }),
  ),
  // Overall verdict: did the candidate pass its guardrails?
  verdict: z.enum(['approved', 'rejected', 'needs-revision']),
  reason: z.string().min(1),
});

export type ComparisonReport = z.infer<typeof ComparisonReportSchema>;
