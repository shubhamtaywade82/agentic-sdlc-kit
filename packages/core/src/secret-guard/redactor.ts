// packages/core/src/secret-guard/redactor.ts
//
// Secret redactor (M11 baseline). Pure function.
//
// Replaces every detected secret value in the input with a placeholder.
// Verifies that the redaction is complete: after replacing, the redactor
// re-runs the detector on the redacted output. If any of the original
// secret values still appear, the corresponding finding's `redacted` flag
// stays false and the caller is alerted.
//
// INVARIANT (post-M7 §5): a finding does not prove redaction. The
// redacted flag is set ONLY after the redactor has verified the value is
// gone from the output.

import type { RedactionPolicy, SecretFinding } from '@agentic-sdlc-kit/contracts';
import { detectSecrets } from './detector.js';

/**
 * verified-clean: scanned, nothing found. redacted: scanned, every found value
 * verified gone. not-scanned: NOT scanned (over the size limit), never "clean".
 * failed: scanned, but redaction could not be verified complete.
 */
export type RedactionStatus = 'verified-clean' | 'redacted' | 'not-scanned' | 'failed';

export interface RedactionResult {
  redactedText: string;
  findings: SecretFinding[]; // with `redacted` flag updated
  status: RedactionStatus;
  // True only if the text was scanned AND every finding was verified redacted.
  fullyRedacted: boolean;
}

/** Stands in for text that was not scanned: the raw text must never be kept. */
export function withheldMarker(bytes: number, limit: number): string {
  return `[WITHHELD: ${bytes} bytes exceed the secret-scan limit of ${limit}; text was not scanned]`;
}

/**
 * Default policy for redacting kit state before it is persisted under
 * .ai-kit/ (experiences, memory, TDD run evidence). Shared so every
 * persisted surface applies the same hygiene (M11 invariant).
 */
export const DEFAULT_REDACTION_POLICY: RedactionPolicy = {
  schemaVersion: 1,
  placeholderFormat: '[REDACTED:<kind>:<id>]',
  redactPartial: true,
  redactRepeated: true,
  maxInputBytes: 1_000_000,
  ignorePaths: [],
};

interface Span {
  start: number;
  end: number;
  finding: SecretFinding;
}

const SEVERITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * Findings can overlap or share a range (a name-anchored rule and a
 * token-shape rule both match one value). Each region must be replaced
 * exactly once: replacing twice uses stale offsets and destroys the text
 * next to the secret. Overlaps merge into one span labelled by the most
 * severe finding.
 */
function mergeSpans(findings: ReadonlyArray<SecretFinding>): Span[] {
  const spans: Span[] = findings
    .filter((f) => f.location.offset !== undefined)
    .map((f) => ({
      start: f.location.offset as number,
      end: (f.location.offset as number) + f.location.length,
      finding: f,
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) {
      last.end = Math.max(last.end, s.end);
      if ((SEVERITY_RANK[s.finding.severity] ?? 0) > (SEVERITY_RANK[last.finding.severity] ?? 0)) {
        last.finding = s.finding;
      }
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

/**
 * Replace every detected secret value in the input with a placeholder.
 * The placeholder format is controlled by the RedactionPolicy.
 */
export function redactSecrets(
  text: string,
  policy: RedactionPolicy,
  source: SecretFinding['location']['source'],
  filePath?: string,
): RedactionResult {
  // Bound the input size. Unscanned is not clean: return a marker, never the
  // raw text, and never claim verification.
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > policy.maxInputBytes) {
    return {
      redactedText: withheldMarker(bytes, policy.maxInputBytes),
      findings: [],
      status: 'not-scanned',
      fullyRedacted: false,
    };
  }
  const findings = detectSecrets(text, source, filePath);
  if (findings.length === 0) {
    return { redactedText: text, findings: [], status: 'verified-clean', fullyRedacted: true };
  }
  // To redact, we need the original values. We can recover them from the
  // text using the finding offsets and lengths.
  let redactedText = text;
  const updatedFindings: SecretFinding[] = [];
  // Replace from the end so earlier offsets stay valid.
  for (const sp of mergeSpans(findings).reverse()) {
    redactedText =
      redactedText.slice(0, sp.start) + formatPlaceholder(policy, sp.finding) + redactedText.slice(sp.end);
  }
  // Verify: re-run the detector on the redacted output. None of the
  // original values should appear.
  const recheck = detectSecrets(redactedText, source, filePath);
  // For each original finding, check if its value still appears in the
  // redacted text. We can't easily get the original value back without
  // re-extracting, but we can check if any of the same kind appears at
  // the same offset.
  for (const f of findings) {
    const offset = f.location.offset;
    if (offset === undefined) {
      updatedFindings.push({ ...f, redacted: false });
      continue;
    }
    const originalValue = text.slice(offset, offset + f.location.length);
    const stillAppears = redactedText.includes(originalValue);
    updatedFindings.push({ ...f, redacted: !stillAppears });
  }
  const fullyRedacted = updatedFindings.every((f) => f.redacted) && recheck.length === 0;
  return {
    redactedText,
    findings: updatedFindings,
    status: fullyRedacted ? 'redacted' : 'failed',
    fullyRedacted,
  };
}

function formatPlaceholder(policy: RedactionPolicy, finding: SecretFinding): string {
  switch (policy.placeholderFormat) {
    case '[REDACTED]':
      return '[REDACTED]';
    case '[REDACTED:<kind>]':
      return `[REDACTED:${finding.kind}]`;
    case '[REDACTED:<kind>:<id>]':
      return `[REDACTED:${finding.kind}:${finding.id}]`;
  }
}
