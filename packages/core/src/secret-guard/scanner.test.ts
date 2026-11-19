// packages/core/src/secret-guard/scanner.test.ts
import { describe, expect, it } from 'vitest';
import { scanText } from './scanner.js';
import type { RedactionPolicy } from '@agentic-sdlc-kit/contracts';

const policy: RedactionPolicy = {
  schemaVersion: 1,
  placeholderFormat: '[REDACTED]',
  redactPartial: true,
  redactRepeated: true,
  maxInputBytes: 1_000_000,
  ignorePaths: [],
};

describe('scanText', () => {
  it('returns outcome=clean for text without secrets', () => {
    const r = scanText('hello world', policy, 'file-read');
    expect(r.outcome).toBe('clean');
    expect(r.findings).toEqual([]);
  });
  it('returns outcome=findings for text with secrets', () => {
    const r = scanText('aws_key=AKIAIOSFODNN7EXAMPLE', policy, 'file-read');
    expect(r.outcome).toBe('findings');
    expect(r.findings.length).toBeGreaterThan(0);
  });
  it('returns outcome=skipped-too-large for oversized input', () => {
    const tinyPolicy: RedactionPolicy = { ...policy, maxInputBytes: 10 };
    const r = scanText('a long string that exceeds ten bytes', tinyPolicy, 'file-read');
    expect(r.outcome).toBe('skipped-too-large');
  });
  it('returns outcome=skipped-ignored for an ignored path', () => {
    const withIgnore: RedactionPolicy = {
      ...policy,
      ignorePaths: ['tests/fixtures/secrets.env'],
    };
    const r = scanText(
      'aws_key=AKIAIOSFODNN7EXAMPLE',
      withIgnore,
      'file-read',
      'tests/fixtures/secrets.env',
    );
    expect(r.outcome).toBe('skipped-ignored');
  });
  it("INVARIANT: never returns an implicit 'clean' when there are secrets", () => {
    const fakeStripe = ['sk', 'test', 'abcdefghijklmnopqrstuvwx'].join('_');
    const r = scanText(`stripe=${fakeStripe}`, policy, 'file-read');
    expect(r.outcome).not.toBe('clean');
  });
});
