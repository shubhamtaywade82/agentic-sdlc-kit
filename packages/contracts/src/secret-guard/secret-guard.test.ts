// packages/contracts/src/secret-guard/secret-guard.test.ts
import { describe, expect, it } from 'vitest';
import { SecretFindingSchema, redactedPreview } from './finding.js';
import { BUILTIN_DETECTION_RULES, DetectionRuleSchema } from './detection-rule.js';
import { RedactionPolicySchema } from './redaction-policy.js';
import { ScannerResultSchema, ScannerOutcomeSchema } from './scanner-failure.js';

describe('redactedPreview', () => {
  it('returns a redacted preview for long secrets', () => {
    expect(redactedPreview('AKIAIOSFODNN7EXAMPLE')).toBe('AKIA…MPLE');
  });
  it('returns [REDACTED:n] for short values', () => {
    expect(redactedPreview('short')).toBe('[REDACTED:5]');
  });
});

describe('SecretFindingSchema', () => {
  it('accepts a file-based finding', () => {
    expect(
      SecretFindingSchema.safeParse({
        id: 'F-1',
        kind: 'github-token',
        location: {
          filePath: 'src/config.ts',
          line: 12,
          column: 5,
          length: 40,
          source: 'file-read',
        },
        detector: 'builtin',
        confidence: 'high',
        severity: 'critical',
        redactedPreview: 'ghp_…abcd',
        redacted: false,
      }).success,
    ).toBe(true);
  });
  it('rejects a finding with neither filePath nor offset', () => {
    expect(
      SecretFindingSchema.safeParse({
        id: 'F-1',
        kind: 'github-token',
        location: { length: 40, source: 'tool-output' },
        detector: 'builtin',
        confidence: 'high',
        severity: 'critical',
        redactedPreview: 'ghp_…abcd',
      }).success,
    ).toBe(false);
  });
});

describe('DetectionRuleSchema and BUILTIN_DETECTION_RULES', () => {
  it('validates every built-in rule', () => {
    for (const rule of BUILTIN_DETECTION_RULES) {
      expect(DetectionRuleSchema.safeParse(rule).success).toBe(true);
    }
  });
  it('includes rules for AWS, GitHub, GitLab, Google, Stripe, Slack, PEM, generic', () => {
    const kinds = BUILTIN_DETECTION_RULES.map((r) => r.kind);
    expect(kinds).toContain('aws-access-key');
    expect(kinds).toContain('github-token');
    expect(kinds).toContain('gitlab-token');
    expect(kinds).toContain('google-api-key');
    expect(kinds).toContain('stripe-key');
    expect(kinds).toContain('slack-token');
    expect(kinds).toContain('private-key-pem');
    expect(kinds).toContain('generic-api-key');
  });
});

describe('RedactionPolicySchema', () => {
  it('accepts a default policy', () => {
    expect(
      RedactionPolicySchema.safeParse({
        schemaVersion: 1,
        placeholderFormat: '[REDACTED:<kind>:<id>]',
        redactPartial: true,
        redactRepeated: true,
        maxInputBytes: 1_000_000,
        ignorePaths: [],
      }).success,
    ).toBe(true);
  });
});

describe('ScannerOutcomeSchema', () => {
  it('accepts the five outcome kinds', () => {
    for (const o of ['clean', 'findings', 'failed', 'skipped-too-large', 'skipped-ignored']) {
      expect(ScannerOutcomeSchema.safeParse(o).success).toBe(true);
    }
  });
  it("rejects 'success' (a scanner cannot report implicit success)", () => {
    expect(ScannerOutcomeSchema.safeParse('success').success).toBe(false);
  });
});

describe('ScannerResultSchema', () => {
  it('accepts a clean result', () => {
    expect(
      ScannerResultSchema.safeParse({
        outcome: 'clean',
        findings: [],
        bytesProcessed: 100,
        durationMs: 5,
      }).success,
    ).toBe(true);
  });
  it('accepts a failed result with an error (no input echoed)', () => {
    expect(
      ScannerResultSchema.safeParse({
        outcome: 'failed',
        findings: [],
        error: { code: 'REGEX_TIMEOUT', message: 'regex timed out' },
        bytesProcessed: 0,
        durationMs: 5000,
      }).success,
    ).toBe(true);
  });
  it('accepts a skipped-too-large result', () => {
    expect(
      ScannerResultSchema.safeParse({
        outcome: 'skipped-too-large',
        findings: [],
        bytesProcessed: 5_000_000,
        durationMs: 0,
      }).success,
    ).toBe(true);
  });
});
