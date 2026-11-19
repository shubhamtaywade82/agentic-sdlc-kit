// packages/contracts/src/observer/retention.ts
//
// M13 retention policy (M13-09). Local retention and cleanup for observer
// events. Privacy-first: redacted by default, configurable retention.

import { z } from 'zod';

export const RetentionPolicySchema = z.object({
  schemaVersion: z.literal(1),
  // How long to keep events (in days). 0 = delete immediately after
  // summary is written; -1 = keep forever.
  retainDays: z.number().int().default(30),
  // Maximum number of events per run before truncating (cap memory).
  maxEventsPerRun: z.number().int().positive().default(10_000),
  // Whether to redact summaries (strip anything that looks like a path,
  // identifier, or value).
  redactSummaries: z.boolean().default(true),
  // Whether to drop token/cost data (privacy).
  dropUsageData: z.boolean().default(false),
  // Path patterns to never record in summaries.
  redactPathPatterns: z.array(z.string()).default([]),
});

export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;
