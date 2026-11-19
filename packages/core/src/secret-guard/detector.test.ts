// packages/core/src/secret-guard/detector.test.ts
import { describe, expect, it } from 'vitest';
import { detectSecrets } from './detector.js';

describe('detectSecrets — AWS access key', () => {
  it('detects an AWS access key ID', () => {
    const text = 'aws_access_key_id = "AKIAIOSFODNN7EXAMPLE"';
    const findings = detectSecrets(text, 'file-read', 'config.env');
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const aws = findings.find((f) => f.kind === 'aws-access-key');
    expect(aws).toBeDefined();
    if (aws) {
      expect(aws.redactedPreview).toBe('AKIA…MPLE');
      expect(aws.redacted).toBe(false); // not yet redacted
      expect(aws.location.filePath).toBe('config.env');
      expect(aws.location.source).toBe('file-read');
      expect(aws.location.length).toBe(20);
    }
  });
});

describe('detectSecrets — GitHub token', () => {
  it('detects a GitHub PAT', () => {
    const text = 'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789AB';
    const findings = detectSecrets(text, 'file-read');
    const gh = findings.find((f) => f.kind === 'github-token');
    expect(gh).toBeDefined();
    if (gh) expect(gh.kind).toBe('github-token');
  });
});

describe('detectSecrets — Stripe key', () => {
  it('detects a Stripe live secret key', () => {
    const fakeKey = ['sk', 'test', 'abcdefghijklmnopqrstuvwx'].join('_');
    const text = `stripe_key = ${fakeKey}`;
    const findings = detectSecrets(text, 'file-read');
    const stripe = findings.find((f) => f.kind === 'stripe-key');
    expect(stripe).toBeDefined();
  });
});

describe('detectSecrets — PEM private key', () => {
  it('detects a PEM private key header', () => {
    const text = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAI...';
    const findings = detectSecrets(text, 'file-read');
    const pem = findings.find((f) => f.kind === 'private-key-pem');
    expect(pem).toBeDefined();
  });
});

describe('detectSecrets — false positives / negatives', () => {
  it('does NOT flag a normal sentence as a secret', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const findings = detectSecrets(text, 'file-read');
    expect(findings).toEqual([]);
  });
  it('detects multiple secrets in one input', () => {
    const fakeStripe = ['sk', 'test', 'abcdefghijklmnopqrstuvwx'].join('_');
    const text =
      `AWS_KEY=AKIAIOSFODNN7EXAMPLE\nSTRIPE=${fakeStripe}\nGITHUB=ghp_abcdefghijklmnopqrstuvwxyz0123456789AB`;
    const findings = detectSecrets(text, 'file-read');
    const kinds = new Set(findings.map((f) => f.kind));
    expect(kinds.has('aws-access-key')).toBe(true);
    expect(kinds.has('stripe-key')).toBe(true);
    expect(kinds.has('github-token')).toBe(true);
  });
});

describe('detectSecrets — never returns the full secret value', () => {
  it('uses redactedPreview, not the raw value', () => {
    const text = 'AKIAIOSFODNN7EXAMPLE';
    const findings = detectSecrets(text, 'file-read');
    for (const f of findings) {
      // The redactedPreview must never contain the full secret.
      expect(f.redactedPreview).not.toBe(text);
      expect(f.redactedPreview.length).toBeLessThan(text.length);
    }
  });
});
