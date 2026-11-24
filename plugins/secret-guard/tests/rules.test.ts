// Credential formats the baseline rule set must catch, and placeholders it
// must not. Each detected value is synthetic.
import { describe, expect, it } from 'vitest';
import { detectSecrets } from '../policies/detect.js';

const kinds = (text: string): string[] => detectSecrets(text, 'file-write').map((f) => f.kind);

describe('secret-guard rule coverage', () => {
  it.each([
    ['OPENAI_API_KEY=sk-proj-' + 'c1'.repeat(20), 'openai-key'],
    ['key = "sk-' + 'D9'.repeat(24) + '"', 'openai-key'],
    ['ANTHROPIC_API_KEY=sk-ant-api03-' + 'd'.repeat(60), 'anthropic-key'],
    ['DATABASE_URL=postgres://admin:s3cretPass@db.internal:5432/prod', 'db-url-credentials'],
    ['url: "mysql://app:Hunter22xyz@10.0.0.4/app"', 'db-url-credentials'],
    ['Authorization: Bearer eyJ' + 'a'.repeat(20) + '.eyJ' + 'b'.repeat(20) + '.' + 'c'.repeat(20), 'jwt-token'],
    ['DHAN_ACCESS_TOKEN=abcd1234efgh5678', 'dhan-credential'],
    ['dhan_pin: "123456"', 'dhan-credential'],
    ['password = "hunter2hunter2"', 'password-assignment'],
    ['PASSWD: "correct-horse-battery"', 'password-assignment'],
  ])('detects %s as %s', (text, kind) => {
    expect(kinds(text)).toContain(kind);
  });

  it.each([
    'DATABASE_URL=postgres://admin:${DB_PASSWORD}@db.internal/prod',
    'url = "postgres://user:<password>@host/db"',
    'password = "${SECRET_FROM_ENV}"',
    'password = "short"',
    'DHAN_ACCESS_TOKEN=${DHAN_ACCESS_TOKEN}',
    'DHAN_CLIENT_ID=1100012345',
    'const task = "sk-learning-about-sorting-algorithms"',
    'see https://example.com/path for docs',
  ])('does not flag placeholder or look-alike: %s', (text) => {
    expect(kinds(text)).toEqual([]);
  });

  it('never returns the secret value in the finding', () => {
    const findings = detectSecrets('DATABASE_URL=postgres://admin:s3cretPass@db/prod', 'file-write');
    expect(JSON.stringify(findings)).not.toContain('s3cretPass');
  });
});
