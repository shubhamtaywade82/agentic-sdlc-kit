// packages/contracts/src/secret-guard/scanner-failure.ts
//
// Scanner failure behavior (M11 — M11-09).
//
// INVARIANT (post-M7 §5): a scanner failure MUST be visible. It MUST NOT
// be reported as a clean result. The ScannerOutcome contract makes this
// explicit: the outcome is one of "clean", "findings", "failed", or
// "skipped-too-large" — never an implicit "clean" when the scanner errored.

import { z } from 'zod';

export const ScannerOutcomeSchema = z.enum([
  'clean', // scanner ran successfully and found no secrets
  'findings', // scanner ran successfully and found secrets
  'failed', // scanner errored; results are NOT trustworthy
  'skipped-too-large', // input exceeded maxInputBytes; not scanned
  'skipped-ignored', // path was in ignorePaths; not scanned
]);

export const ScannerResultSchema = z.object({
  outcome: ScannerOutcomeSchema,
  // Present only when outcome === "findings".
  findings: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string(),
        redactedPreview: z.string(),
      }),
    )
    .default([]),
  // Present only when outcome === "failed". NEVER includes the input that
  // caused the failure (could contain a secret).
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  // The number of bytes scanned (or skipped).
  bytesProcessed: z.number().int().nonnegative(),
  // Duration in milliseconds.
  durationMs: z.number().int().nonnegative(),
});

export type ScannerOutcome = z.infer<typeof ScannerOutcomeSchema>;
export type ScannerResult = z.infer<typeof ScannerResultSchema>;
