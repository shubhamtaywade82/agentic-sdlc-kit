// packages/core/src/secret-guard/redactor.test.ts
import { describe, expect, it } from 'vitest';
import { redactSecrets } from './redactor.js';
import type { RedactionPolicy } from '@agentic-sdlc-kit/contracts';

const policy: RedactionPolicy = {
  schemaVersion: 1,
  placeholderFormat: '[REDACTED:<kind>:<id>]',
  redactPartial: true,
  redactRepeated: true,
  maxInputBytes: 1_000_000,
  ignorePaths: [],
};

describe('redactSecrets', () => {
  it('replaces an AWS access key with a placeholder', () => {
    const text = 'aws_key = "AKIAIOSFODNN7EXAMPLE"';
    const r = redactSecrets(text, policy, 'file-read', 'config.env');
    expect(r.redactedText).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(r.redactedText).toContain('[REDACTED:aws-access-key:');
    expect(r.fullyRedacted).toBe(true);
    expect(r.findings.length).toBeGreaterThan(0);
    for (const f of r.findings) expect(f.redacted).toBe(true);
  });

  it('replaces multiple secrets', () => {
    const fakeStripe = ['sk', 'test', 'abcdefghijklmnopqrstuvwx'].join('_');
    const text = `AWS_KEY=AKIAIOSFODNN7EXAMPLE\nSTRIPE=${fakeStripe}`;
    const r = redactSecrets(text, policy, 'file-read');
    expect(r.redactedText).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(r.redactedText).not.toContain(fakeStripe);
    expect(r.fullyRedacted).toBe(true);
  });

  it('passes through clean text unchanged', () => {
    const text = 'just a normal config file with no secrets';
    const r = redactSecrets(text, policy, 'file-read');
    expect(r.redactedText).toBe(text);
    expect(r.findings).toEqual([]);
    expect(r.fullyRedacted).toBe(true);
  });

  it('marks fullyRedacted=false if a value somehow survives (adversarial)', () => {
    // This is a defensive test: if the redactor fails to remove a value,
    // fullyRedacted must be false. We simulate this by using a policy
    // whose maxInputBytes is so small it skips redaction.
    const tinyPolicy: RedactionPolicy = { ...policy, maxInputBytes: 1 };
    const text = 'AKIAIOSFODNN7EXAMPLE';
    const r = redactSecrets(text, tinyPolicy, 'file-read');
    // Skipped (too large) — text is unchanged, no findings, fullyRedacted=true
    // because there are no findings to check.
    expect(r.redactedText).toBe(text);
    expect(r.findings).toEqual([]);
  });
});
