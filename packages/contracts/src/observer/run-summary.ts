// packages/contracts/src/observer/run-summary.ts
//
// M13 run summary (M13-06). The shape produced by `kit runs show RUN-001`.

import { z } from 'zod';
import { ObserverEventSchema } from './event-schema.js';

export const RunSummarySchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(['in-progress', 'completed', 'failed', 'blocked']),
  // Aggregated metrics. Every field is optional because the observer
  // represents partial telemetry honestly (never as zero).
  totals: z.object({
    turns: z.number().int().nonnegative().optional(),
    toolCalls: z.number().int().nonnegative().optional(),
    agentsSpawned: z.number().int().nonnegative().optional(),
    tokensIn: z.number().int().nonnegative().optional(),
    tokensOut: z.number().int().nonnegative().optional(),
    estimatedCostUnits: z.number().nonnegative().optional(),
    escalations: z.number().int().nonnegative().optional(),
    blockedActions: z.number().int().nonnegative().optional(),
  }),
  // Verification results correlated with this run.
  verificationStatus: z.enum(['passed', 'failed', 'blocked', 'not-run']).optional(),
});

export const RunReportSchema = z.object({
  schemaVersion: z.literal(1),
  summary: RunSummarySchema,
  events: z.array(ObserverEventSchema),
});

export type RunSummary = z.infer<typeof RunSummarySchema>;
export type RunReport = z.infer<typeof RunReportSchema>;
