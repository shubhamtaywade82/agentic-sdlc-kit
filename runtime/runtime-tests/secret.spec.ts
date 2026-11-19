import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlaceholder, isProdEnvPath, redact, scanText } from '../secret-guard/policies/detect';
import type { Finding } from '../secret-guard/policies/detect';

// NOTE: all credential-shaped samples below are built by concatenation on
// purpose (source files must not contain literal secrets).

function ids(findings: Finding[]): string[] {
  return findings.map((f) => f.patternId);
}

// ---------------------------------------------------------------------------
// every canonical pattern matches a real-shaped sample
// ---------------------------------------------------------------------------

test('detects an AWS access key id', () => {
  const awsKey = 'AKIA' + 'IOSFODNN7EXAMPLE'; // canonical docs sample, 16 chars after AKIA
  const findings = scanText('aws_key = ' + awsKey);
  assert.ok(ids(findings).includes('aws-access-key-id'));
  assert.equal(findings[0].line, 1);
  assert.equal(findings[0].preview, 'AKIAIO...');
});

test('detects private key blocks', () => {
  const headers = [
    ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
    ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' '),
    ['-----BEGIN', 'OPENSSH PRIVATE KEY-----'].join(' '),
    ['-----BEGIN', 'ENCRYPTED PRIVATE KEY-----'].join(' '),
  ];
  for (const header of headers) {
    const findings = scanText('-----\n' + header + '\nMIIE...\n-----END PRIVATE KEY-----');
    assert.ok(ids(findings).includes('private-key-block'), header);
  }
});

test('detects github, gitlab and slack tokens', () => {
  const gh = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'; // 36 chars after the prefix
  const findings = scanText('GITHUB_TOKEN=' + gh);
  assert.ok(ids(findings).includes('github-token'));
  assert.equal(findings.length, 1); // unquoted assignment → only the token pattern fires

  const gl = 'glpat-' + '0123456789abcdef0123'; // 20 chars after the prefix
  assert.ok(ids(scanText('token: ' + gl)).includes('gitlab-token'));

  const slack = 'xox' + 'b-1234567890-abcdefghij';
  assert.ok(ids(scanText('slack: ' + slack)).includes('slack-token'));
});

test('detects stripe keys and NOT as openai keys', () => {
  const live = 'sk_live_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3'; // 27 chars ≥ 24
  const findings = scanText('STRIPE_SECRET_KEY=' + live);
  assert.ok(ids(findings).includes('stripe-key'), 'stripe pattern must match');
  assert.ok(!ids(findings).includes('openai-key'), 'sk_live_ must not be reported as openai-key');
  assert.ok(ids(scanText('pk_test_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3')).includes('stripe-key'));
});

test('detects google api keys and openai keys', () => {
  const google = 'AIza' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R'; // exactly 35 chars after AIza
  assert.ok(ids(scanText('key: ' + google)).includes('google-api-key'));
  const openai = 'sk-' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3'; // 25 chars ≥ 20
  assert.ok(ids(scanText('OPENAI_API_KEY=' + openai)).includes('openai-key'));
  // short noise does not match
  assert.equal(scanText('sk-short').length, 0);
});

test('detects generic credential assignments', () => {
  for (const line of [
    'password = "hunter2hunter2hunter2"',
    "passwd: 'abcdefghijklmnop'",
    'secret: "0123456789abcdef"',
    'api_key: "abcdefghijklmnop"',
    'api-key = "abcdefghijklmnop"',
    'auth_token: "abcdefghijklmnop"',
    'access-token: "abcdefghijklmnop"',
  ]) {
    assert.ok(ids(scanText(line)).includes('generic-assignment'), line);
  }
  // too-short values are ignored
  assert.equal(scanText('password = "short"').length, 0);
});

// ---------------------------------------------------------------------------
// placeholders
// ---------------------------------------------------------------------------

test('placeholder values are ignored', () => {
  for (const line of [
    'password: "${DATABASE_PASSWORD}"',
    'password: "{{ db_password }}"',
    'password: "<enter-your-password>"',
    'password: "changemechangeme"',
    'password: "exampleexample123"',
    'password: "placeholder-value-1"',
    'password: "dummydummydummy123"',
    'password: "xxxxxxxxxxxxxxxx"',
    'password: "[REDACTED-FOR-TEST-12]"',
    'password: "your-api-key-goes-here"',
  ]) {
    assert.equal(scanText(line).length, 0, line);
  }
});

test('isPlaceholder recognizes templates and markers', () => {
  assert.ok(isPlaceholder('${VAULT_TOKEN}'));
  assert.ok(isPlaceholder('{{secret}}'));
  assert.ok(isPlaceholder('<token>'));
  assert.ok(isPlaceholder('ChangeMe-12345678'));
  assert.ok(isPlaceholder('EXAMPLE-VALUE-1234'));
  assert.ok(isPlaceholder('xxxxx'));
  assert.ok(isPlaceholder('redacted-credential'));
  assert.ok(isPlaceholder('your-token-here'));
  assert.ok(!isPlaceholder('a1B2c3D4e5F6g7H8i9J0k1L2'));
  assert.ok(!isPlaceholder('AKIA' + 'IOSFODNN7REALKEY')); // strict token shape, no markers
});

// ---------------------------------------------------------------------------
// line numbers, previews and multi-line text
// ---------------------------------------------------------------------------

test('findings carry 1-based line numbers and 6-char previews', () => {
  const text = [
    'line one',
    '# config',
    'password = "ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"',
    'clean line',
  ].join('\n');
  const findings = scanText(text);
  assert.equal(findings.length, 2); // github-token + generic-assignment
  for (const f of findings) {
    assert.equal(f.line, 3);
    assert.ok(f.preview.endsWith('...'));
    assert.ok(f.preview.length <= 9);
    assert.ok(!f.preview.includes('a1B2c3D4e5F6g7H8i9J0k1L2')); // never the full secret
  }
});

// ---------------------------------------------------------------------------
// redact
// ---------------------------------------------------------------------------

test('redact masks full matches with pattern-id tags', () => {
  const gh = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
  const out = redact('token ' + gh + ' and password = "hunter2hunter2hunter2"');
  assert.ok(out.includes('[REDACTED:github-token]'));
  assert.ok(out.includes('[REDACTED:generic-assignment]'));
  assert.ok(!out.includes(gh));
  assert.ok(!out.includes('hunter2'));
  // placeholders survive redaction untouched
  const kept = redact('password = "${DB_PASSWORD}"');
  assert.ok(kept.includes('${DB_PASSWORD}'));
});

// ---------------------------------------------------------------------------
// production env file detection
// ---------------------------------------------------------------------------

test('isProdEnvPath flags production-flavored env files only', () => {
  for (const p of ['.env.production', '.env.live', '.env.prod', '.env.production.local', 'config/.env.prod']) {
    assert.ok(isProdEnvPath(p), p);
  }
  for (const p of ['.env', '.env.local', '.env.development', '.env.example', 'src/env.ts']) {
    assert.ok(!isProdEnvPath(p), p);
  }
});

test('clean text produces no findings', () => {
  const clean = [
    'export const add = (a, b) => a + b;',
    '# no secrets here',
    'const retries = process.env.RETRIES ?? 3;',
    'See .env.example for required variables.',
  ].join('\n');
  assert.equal(scanText(clean).length, 0);
});
