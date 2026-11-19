// packages/contracts/src/maintenance/bug-report.ts
//
// Bug report contract (M9 — M9-01, M9-02).
//
// A bug report is the input to /kit:fix. The kit classifies it and decides
// whether reproduction is possible. A non-reproducible issue MUST be
// reported as such — the kit MUST NOT claim reproduction when only a
// theoretical explanation exists.

import { z } from 'zod';

export const BugCategorySchema = z.enum([
  'functional',
  'regression',
  'data',
  'security',
  'performance',
  'ui',
  'other',
]);

export const ReproductionStatusSchema = z.enum([
  'not-attempted',
  'reproduced',
  'not-reproducible',
  'intermittent',
]);

export const BugReportSchema = z
  .object({
    id: z.string().regex(/^[A-Z]+-[0-9]{3,}$/, 'id must match BUG-NNN'),
    title: z.string().min(1).max(200),
    description: z.string().min(1),
    reportedAt: z.string(),
    reportedBy: z.string(),
    category: BugCategorySchema,
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    // Steps to reproduce as reported by the user.
    reportedSteps: z.array(z.string()),
    expectedBehavior: z.string().min(1),
    actualBehavior: z.string().min(1),
    // URLs / commit SHAs / environments where the bug was observed.
    environment: z
      .array(
        z.object({
          key: z.string(),
          value: z.string(),
        }),
      )
      .default([]),
    // Initial reproduction status. Set to "not-attempted" by default.
    reproductionStatus: ReproductionStatusSchema.default('not-attempted'),
  })
  .strict();

export type BugCategory = z.infer<typeof BugCategorySchema>;
export type ReproductionStatus = z.infer<typeof ReproductionStatusSchema>;
export type BugReport = z.infer<typeof BugReportSchema>;
