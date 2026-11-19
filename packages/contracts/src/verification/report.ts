// packages/contracts/src/verification/report.ts
//
// Verification report contract. The status union is exhaustive and
// forbids the "skipped = passed" failure mode by construction.
//
// Critical invariants (see docs/contracts/CONTRACTS.md §6):
//   - passed: execution succeeded.
//   - failed: execution found a failure.
//   - skipped: the check was not performed. NEVER counts as passed.
//   - blocked: the check could not safely proceed. NEVER counts as passed.
//   - A scanner failure is `failed` or `blocked`, never `passed`.
//
// See docs/security/SECURITY.md §1 (no false assurance).

import { z } from 'zod';

export const CheckStatusSchema = z.enum(['passed', 'failed', 'skipped', 'blocked']);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const VERIFICATION_REPORT_SCHEMA_VERSION = 1 as const;

export const CheckSchema = z.object({
  id: z.string(),
  status: CheckStatusSchema,
  command: z.array(z.string()).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  evidence: z.array(z.string()).optional(),
  errors: z.array(z.string()).optional(),
});

export const VerificationReportSchema = z.object({
  schemaVersion: z.literal(VERIFICATION_REPORT_SCHEMA_VERSION),
  runId: z.string(),
  commitSha: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
  status: z.enum(['passed', 'failed', 'blocked']),
  checks: z.array(CheckSchema),
});

export type Check = z.infer<typeof CheckSchema>;
export type VerificationReport = z.infer<typeof VerificationReportSchema>;

/**
 * Roll up check statuses into the report status.
 *
//   - Any `failed` check → report `failed`.
//   - Any `blocked` check (and no failed) → report `blocked`.
//   - Otherwise → `passed`.
//
// A `skipped` check NEVER promotes a report to `passed` on its own; if
// every check is `skipped`, the report is `blocked` (we could not safely
// verify anything). This is a contract invariant, not a convenience.
 */
export function rollupReportStatus(checks: ReadonlyArray<Check>): VerificationReport['status'] {
  if (checks.length === 0) return 'blocked';
  if (checks.some((c) => c.status === 'failed')) return 'failed';
  if (checks.some((c) => c.status === 'blocked')) return 'blocked';
  if (checks.every((c) => c.status === 'skipped')) return 'blocked';
  return 'passed';
}
