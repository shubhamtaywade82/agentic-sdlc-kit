// plugins/secret-guard/tests/detect.test.ts
//
// Policy tests for the vendored detector/scanner/redactor (the kit's M11
// baseline, self-contained in this plugin).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REDACTION_POLICY,
  detectSecrets,
  redactSecrets,
  scanText,
} from '../policies/detect';

const AWS_KEY_SAMPLE = 'AKIAIOSFODNNN7EXAMPLE';
const GITHUB_TOKEN_SAMPLE = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';

describe('detectSecrets', () => {
  it('matches each built-in pattern against real-shaped samples', () => {
    const samples: Array<[string, string]> = [
      [AWS_KEY_SAMPLE, 'aws-access-key'],
      ['aws_secret_access_key = ' + 'A'.repeat(40), 'aws-secret-key'],
      [GITHUB_TOKEN_SAMPLE, 'github-token'],
      ['glpat-' + 'AbCdEfGhIjKlMnOpQrSt', 'gitlab-token'],
      ['AIza' + 'a'.repeat(35), 'google-api-key'],
      ['sk_live_' + 'a'.repeat(30), 'stripe-key'],
      ['xoxb-' + 'a'.repeat(15), 'slack-token'],
      ['-----BEGIN RSA PRIVATE KEY-----', 'private-key-pem'],
      ['api_key = "' + 'a'.repeat(40) + '"', 'generic-api-key'],
    ];
    for (const [text, expectedKind] of samples) {
      const findings = detectSecrets(text, 'file-write');
      expect(findings.some((f) => f.kind === expectedKind), `${text.slice(0, 12)}… → ${expectedKind}`).toBe(
        true,
      );
    }
  });

  it('never exposes the full secret in a preview', () => {
    const findings = detectSecrets(`token=${GITHUB_TOKEN_SAMPLE}`, 'tool-output');
    for (const f of findings) {
      expect(f.redactedPreview).not.toContain(GITHUB_TOKEN_SAMPLE);
    }
  });

  it('carries line/column/offset metadata', () => {
    const findings = detectSecrets(`line one\nkey = ${AWS_KEY_SAMPLE}\n`, 'file-write');
    expect(findings.length).toBe(1);
    expect(findings[0]?.location.line).toBe(2);
    expect(findings[0]?.location.offset).toBeGreaterThan(0);
  });
});

describe('scanText', () => {
  it('reports findings with previews, never values', () => {
    const result = scanText(`k=${AWS_KEY_SAMPLE}`, DEFAULT_REDACTION_POLICY, 'file-write', 'a.txt');
    expect(result.outcome).toBe('findings');
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]?.redactedPreview).not.toContain(AWS_KEY_SAMPLE);
  });

  it('reports clean for ordinary text', () => {
    const result = scanText('just a normal line\n', DEFAULT_REDACTION_POLICY, 'file-write');
    expect(result.outcome).toBe('clean');
    expect(result.findings).toEqual([]);
  });

  it('skips inputs over the policy bound (never reports clean)', () => {
    const policy = { ...DEFAULT_REDACTION_POLICY, maxInputChars: 10 };
    const result = scanText('a'.repeat(50), policy, 'file-write');
    expect(result.outcome).toBe('skipped-too-large');
  });

  it('skips ignored paths (never reports clean)', () => {
    // ignorePaths is an exact-path list (same semantics as the kit core).
    const policy = { ...DEFAULT_REDACTION_POLICY, ignorePaths: ['fixtures/x.sample'] };
    const result = scanText(`k=${AWS_KEY_SAMPLE}`, policy, 'file-write', 'fixtures/x.sample');
    expect(result.outcome).toBe('skipped-ignored');
  });
});

describe('redactSecrets', () => {
  it('replaces every secret and verifies completeness', () => {
    const text = `first ${AWS_KEY_SAMPLE} then ${GITHUB_TOKEN_SAMPLE}`;
    const result = redactSecrets(text, DEFAULT_REDACTION_POLICY, 'tool-output');
    expect(result.redactedText).not.toContain(AWS_KEY_SAMPLE);
    expect(result.redactedText).not.toContain(GITHUB_TOKEN_SAMPLE);
    expect(result.redactedText).toContain('[REDACTED:');
    expect(result.fullyRedacted).toBe(true);
    expect(result.findings.every((f) => f.redacted)).toBe(true);
  });

  it('is a no-op for clean text', () => {
    const result = redactSecrets('nothing here', DEFAULT_REDACTION_POLICY, 'tool-output');
    expect(result.redactedText).toBe('nothing here');
    expect(result.fullyRedacted).toBe(true);
  });
});

describe('redactSecrets status (fail closed on unscanned input)', () => {
  const small = { ...DEFAULT_REDACTION_POLICY, maxInputChars: 32 };

  it('reports not-scanned for oversized text, never verified-clean, and withholds the text', () => {
    const text = 'filler '.repeat(20) + AWS_KEY_SAMPLE;
    const r = redactSecrets(text, small, 'tool-output');
    expect(r.status).toBe('not-scanned');
    expect(r.fullyRedacted).toBe(false);
    expect(r.redactedText).not.toContain(AWS_KEY_SAMPLE);
    expect(r.redactedText).toMatch(/WITHHELD/);
    expect(r.findings).toEqual([]);
  });

  it('reports verified-clean for scanned clean text and redacted for scanned secrets', () => {
    expect(redactSecrets('nothing here', DEFAULT_REDACTION_POLICY, 'tool-output').status).toBe(
      'verified-clean',
    );
    expect(
      redactSecrets(`k=${AWS_KEY_SAMPLE}`, DEFAULT_REDACTION_POLICY, 'tool-output').status,
    ).toBe('redacted');
  });
});
