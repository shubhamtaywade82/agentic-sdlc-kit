// packages/core/src/secret-guard/scanner.ts
//
// Scanner wrapper that produces a ScannerResult with one of the five
// outcome kinds: clean, findings, failed, skipped-too-large, skipped-ignored.
//
// INVARIANT: a scanner failure MUST be reported as `failed`, never as
// `clean`. A skipped scan (too large or ignored) MUST be reported as its
// specific skip kind, never as `clean`.

import { type RedactionPolicy, type ScannerResult } from '@agentic-sdlc-kit/contracts';
import { detectSecrets } from './detector.js';

export function scanText(
  text: string,
  policy: RedactionPolicy,
  source: Parameters<typeof detectSecrets>[1],
  filePath?: string,
): ScannerResult {
  const start = Date.now();
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > policy.maxInputBytes) {
    return {
      outcome: 'skipped-too-large',
      findings: [],
      bytesProcessed: bytes,
      durationMs: Date.now() - start,
    };
  }
  if (filePath && policy.ignorePaths.includes(filePath)) {
    return {
      outcome: 'skipped-ignored',
      findings: [],
      bytesProcessed: bytes,
      durationMs: Date.now() - start,
    };
  }
  try {
    const findings = detectSecrets(text, source, filePath);
    return {
      outcome: findings.length === 0 ? 'clean' : 'findings',
      findings: findings.map((f) => ({
        id: f.id,
        kind: f.kind,
        redactedPreview: f.redactedPreview,
      })),
      bytesProcessed: bytes,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return {
      outcome: 'failed',
      findings: [],
      error: {
        code: 'SCANNER_ERROR',
        message: e instanceof Error ? e.message : String(e),
      },
      bytesProcessed: bytes,
      durationMs: Date.now() - start,
    };
  }
}
