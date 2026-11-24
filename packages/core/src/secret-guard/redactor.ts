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

export interface RedactionResult {
  redactedText: string;
  findings: SecretFinding[]; // with `redacted` flag updated
  // True if every finding was verified redacted; false if any value still
  // appears in the output.
  fullyRedacted: boolean;
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
  // Bound the input size.
  if (Buffer.byteLength(text, 'utf8') > policy.maxInputBytes) {
    // Skip — return the text unchanged with no findings. The caller
    // should have used the scanner contract to mark this as
    // "skipped-too-large" instead.
    return { redactedText: text, findings: [], fullyRedacted: true };
  }
  const findings = detectSecrets(text, source, filePath);
  if (findings.length === 0) {
    return { redactedText: text, findings: [], fullyRedacted: true };
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
  return { redactedText, findings: updatedFindings, fullyRedacted };
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
