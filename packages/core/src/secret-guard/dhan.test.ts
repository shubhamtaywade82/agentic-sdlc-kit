// packages/core/src/secret-guard/dhan.test.ts
//
// DhanHQ rules. The same cases run against the vendored plugin detector
// (plugins/secret-guard/tests/dhan.test.ts): the two must stay compatible.
import { describe, expect, it } from 'vitest';
import type { RedactionPolicy } from '@agentic-sdlc-kit/contracts';
import { detectSecrets } from './detector.js';
import { redactSecrets as redact } from './redactor.js';

const POLICY: RedactionPolicy = {
  schemaVersion: 1,
  placeholderFormat: '[REDACTED:<kind>:<id>]',
  redactPartial: true,
  redactRepeated: true,
  maxInputBytes: 1_000_000,
  ignorePaths: [],
};
const redactSecrets = redact;

// Synthetic values assembled at runtime: no token-shaped literal is committed.
const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [b64({ alg: 'HS512', typ: 'JWT' }), b64({ iss: 'example', sub: 'synthetic' }), 'c9'.repeat(22)].join('.');
const TOK = 'Z9'.repeat(14); // 28 chars, contains digits

const kinds = (text: string): string[] => detectSecrets(text, 'file-write').map((f) => f.kind);
const dhan = (text: string): boolean => kinds(text).includes('dhan-credential');

describe('dhan-credential: name-anchored assignments are detected', () => {
  it.each([
    ['env file, JWT value', `DHAN_ACCESS_TOKEN=${JWT}`],
    ['snake_case, double quotes', `dhan_access_token = "${TOK}"`],
    ['camelCase, single quotes', `dhanAccessToken: '${TOK}'`],
    ['secret key name', `DHAN_SECRET_KEY="${TOK}"`],
    ['json property', `{"dhan_token": "${TOK}"}`],
    ['export with api key', `export DHAN_API_KEY=${TOK}`],
    ['mixed case prefix', `Dhan_Token = "${TOK}"`],
  ])('%s', (_label, text) => {
    expect(dhan(text)).toBe(true);
  });

  it('reports severity critical and never the value', () => {
    const f = detectSecrets(`DHAN_ACCESS_TOKEN=${TOK}`, 'file-write').find((x) => x.kind === 'dhan-credential')!;
    expect(f.severity).toBe('critical');
    expect(JSON.stringify(f)).not.toContain(TOK);
    expect(f.redactedPreview).toBe(`${TOK.slice(0, 4)}…${TOK.slice(-4)}`);
  });

  it('locates the value on the right line and column', () => {
    const f = detectSecrets(`# config\nDHAN_ACCESS_TOKEN=${TOK}\n`, 'file-write').find((x) => x.kind === 'dhan-credential')!;
    expect(f.location.line).toBe(2);
    expect(f.location.column).toBe('DHAN_ACCESS_TOKEN='.length + 1);
    expect(f.location.length).toBe(TOK.length);
  });
});

describe('dhan-credential: placeholders and look-alikes are not flagged', () => {
  it.each([
    'DHAN_ACCESS_TOKEN=your_access_token_here',
    'DHAN_ACCESS_TOKEN=${DHAN_ACCESS_TOKEN}',
    'DHAN_ACCESS_TOKEN=<paste token here>',
    'dhan_token = "changeme-changeme-changeme1"',
    'DHAN_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx1',
    'DHAN_ACCESS_TOKEN=example_token_value_0001',
    'DHAN_CLIENT_ID=1100000000',
    'dhan_token = self.config.dhan_access_token',
    'dhan_token = os.getenv("DHAN_TOKEN")',
    'dhan_token = "short1"', // generic names need a 20+ char value
    'DHAN_ACCESS_TOKEN=',
    'the dhan token expires after a day',
    `ACCESS_TOKEN=${TOK}`,
    `broker_token = ${TOK}`,
  ])('%s', (text) => {
    expect(dhan(text)).toBe(false);
  });
});

describe('jwt-token rule', () => {
  it('detects a three-part JWT anywhere, severity critical', () => {
    for (const text of [`access-token: ${JWT}`, `curl -H "Authorization: Bearer ${JWT}"`, JWT]) {
      const f = detectSecrets(text, 'tool-output').find((x) => x.kind === 'jwt-token');
      expect(f, text).toBeDefined();
      expect(f!.severity).toBe('critical');
      expect(f!.location.length).toBe(JWT.length);
    }
  });

  it.each([
    'eyJhbGciOiJ.eyJzdWIiOiJ', // two segments only
    'eyJ.eyJ.sig', // far too short
    'eyJhbGci is how a JWT header starts',
  ])('does not flag %s', (text) => {
    expect(kinds(text)).not.toContain('jwt-token');
  });
});

describe('redaction of Dhan credentials', () => {
  it('removes the value even when the dhan and jwt rules overlap', () => {
    const r = redactSecrets(`DHAN_ACCESS_TOKEN=${JWT}\nother=1`, POLICY, 'tool-output');
    expect(r.redactedText).not.toContain(JWT);
    expect(r.redactedText).not.toContain(JWT.split('.')[1]!);
    expect(r.redactedText).toContain('other=1');
    expect(r.fullyRedacted).toBe(true);
    expect(r.findings.every((f) => f.redacted)).toBe(true);
  });

  it('is idempotent: redacted output is clean', () => {
    const once = redactSecrets(`dhan_access_token = "${TOK}"`, POLICY, 'tool-output');
    expect(detectSecrets(once.redactedText, 'tool-output')).toEqual([]);
  });
});

describe('redaction with overlapping findings (regression)', () => {
  it('never destroys text next to a secret matched by two rules', () => {
    const gh = 'ghp_' + 'aB3dE5'.repeat(7); // github-token AND generic-api-key (quoted api_key)
    const text = `before\napi_key = "${gh}"\nafter`;
    const r = redactSecrets(text, POLICY, 'tool-output');
    expect(r.redactedText.startsWith('before\napi_key = "[REDACTED:')).toBe(true);
    expect(r.redactedText.endsWith('"\nafter')).toBe(true);
    expect(r.redactedText).not.toContain(gh);
  });
});
