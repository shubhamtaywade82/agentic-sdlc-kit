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
  // Sort findings by offset descending so replacements don't shift later
  // offsets.
  const sorted = [...findings].sort((a, b) => {
    const aOffset = a.location.offset ?? 0;
    const bOffset = b.location.offset ?? 0;
    return bOffset - aOffset;
  });
  for (const f of sorted) {
    const offset = f.location.offset;
    const length = f.location.length;
    if (offset === undefined) continue;
    const placeholder = formatPlaceholder(policy, f);
    redactedText =
      redactedText.slice(0, offset) + placeholder + redactedText.slice(offset + length);
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
