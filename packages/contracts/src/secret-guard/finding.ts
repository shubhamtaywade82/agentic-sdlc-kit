// packages/contracts/src/secret-guard/finding.ts
//
// Secret finding contract (M11 — M11-01).
//
// A SecretFinding is the scanner-neutral representation of a detected
// secret. Different scanners (built-in, Gitleaks, TruffleHog) produce
// findings in this common shape so that downstream redaction and reporting
// do not depend on which scanner ran.

import { z } from 'zod';

export const SecretKindSchema = z.enum([
  'aws-access-key',
  'aws-secret-key',
  'github-token',
  'gitlab-token',
  'google-api-key',
  'google-oauth-id',
  'stripe-key',
  'slack-token',
  'generic-api-key',
  'private-key-pem',
  'jwt',
  'connection-string',
  'bearer-token',
  'unknown',
]);

// Renamed to SecretSeveritySchema to avoid collision with the
// specification.ts SeveritySchema (which is 3-level "low|medium|high" for
// risk severity). Secret severity is 4-level because secrets can be
// "critical" (e.g., production keys).
export const SecretSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const SecretFindingSchema = z.object({
  id: z.string(),
  kind: SecretKindSchema,
  // Where the secret was found.
  location: z
    .object({
      // File path (if file-based).
      filePath: z.string().optional(),
      // 1-indexed line number (if known).
      line: z.number().int().positive().optional(),
      // 1-indexed column (if known).
      column: z.number().int().nonnegative().optional(),
      // 0-indexed offset (if known).
      offset: z.number().int().nonnegative().optional(),
      // Length of the matched secret in bytes.
      length: z.number().int().positive(),
      // Source: where the secret was observed.
      source: z.enum([
        'file-read',
        'file-write',
        'tool-output',
        'git-staged',
        'git-commit',
        'git-push',
        'mcp-response',
      ]),
    })
    .refine((l) => l.filePath !== undefined || l.offset !== undefined, {
      message: 'location must have filePath or offset',
    }),
  // The detector that produced this finding.
  detector: z.enum(['builtin', 'gitleaks', 'trufflehog', 'custom']),
  // Confidence: high = pattern + checksum valid; medium = pattern only;
  // low = heuristic match.
  confidence: z.enum(['low', 'medium', 'high']),
  severity: SecretSeveritySchema,
  // A redacted preview: first 4 chars + "…" + last 4 chars, only if the
  // secret is long enough. NEVER the full secret.
  redactedPreview: z.string(),
  // Whether the finding was confirmed to be redacted in the output.
  // INVARIANT (post-M7 §5): a finding does not prove redaction. This flag
  // is set only after the redactor has verified the value is gone.
  redacted: z.boolean().default(false),
});

export type SecretKind = z.infer<typeof SecretKindSchema>;
export type SecretSeverity = z.infer<typeof SecretSeveritySchema>;
export type SecretFinding = z.infer<typeof SecretFindingSchema>;

/**
 * Produce a redacted preview of a secret value. NEVER returns the full
 * value. For secrets shorter than 12 chars, returns "[REDACTED:<n>]".
 */
export function redactedPreview(value: string): string {
  if (value.length < 12) {
    return `[REDACTED:${value.length}]`;
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
