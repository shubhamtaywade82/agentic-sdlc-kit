// packages/contracts/src/secret-guard/redaction-policy.ts
//
// Redaction policy (M11 — M11-04).
//
// The redactor replaces detected secret values with a placeholder in tool
// output, file writes, and git operations. The policy declares what
// placeholder to use and how to handle repeated and partial occurrences.

import { z } from 'zod';

export const REDACTION_POLICY_SCHEMA_VERSION = 1 as const;

export const RedactionPolicySchema = z.object({
  schemaVersion: z.literal(REDACTION_POLICY_SCHEMA_VERSION),
  // Placeholder format: "[REDACTED:<kind>:<id>]" by default.
  placeholderFormat: z
    .enum(['[REDACTED]', '[REDACTED:<kind>]', '[REDACTED:<kind>:<id>]'])
    .default('[REDACTED:<kind>:<id>]'),
  // Whether to redact partial occurrences (e.g., a secret that spans
  // multiple lines or appears in a base64-encoded payload).
  redactPartial: z.boolean().default(true),
  // Whether to redact repeated occurrences in the same output.
  redactRepeated: z.boolean().default(true),
  // Maximum input size (bytes) the redactor will process. Inputs larger
  // than this are returned with a "REDACTION_SKIPPED_TOO_LARGE" notice
  // rather than being silently passed through.
  maxInputBytes: z.number().int().positive().default(1_000_000),
  // Explicit ignore paths (e.g., test fixtures that intentionally contain
  // synthetic secrets). MUST be specific paths, not globs that could
  // match arbitrary files.
  ignorePaths: z.array(z.string()).default([]),
});

export type RedactionPolicy = z.infer<typeof RedactionPolicySchema>;
