// plugins/secret-guard/tests/redaction-verified.test.ts
//
// Verified-redaction contract for the redactor: every detected value must be
// gone from the output, the verdict must be honest, and a second pass must
// find nothing.
import { describe, expect, it } from 'vitest';
import { DEFAULT_REDACTION_POLICY, detectSecrets, redactSecrets } from '../policies/detect';

const AWS_KEY_SAMPLE = 'AKIAIOSFODNNN7EXAMPLE';
const BARE_SECRET = 'hunter2hunter2';

describe('redactSecrets: value-level redaction', () => {
  it('removes a bare copy of a value that an assignment rule also matched', () => {
    const text = `password="${BARE_SECRET}"\nlater: echo ${BARE_SECRET}\n`;
    const r = redactSecrets(text, DEFAULT_REDACTION_POLICY, 'tool-output');
    expect(r.redactedText).not.toContain(BARE_SECRET);
    expect(r.status).toBe('redacted');
    expect(r.fullyRedacted).toBe(true);
  });

  it('redacts a value repeated at the start, middle and end of the text', () => {
    const text = `${AWS_KEY_SAMPLE}\nA ${AWS_KEY_SAMPLE} B\n${AWS_KEY_SAMPLE}`;
    const r = redactSecrets(text, DEFAULT_REDACTION_POLICY, 'tool-output');
    expect(r.redactedText).not.toContain(AWS_KEY_SAMPLE);
    expect(r.fullyRedacted).toBe(true);
  });

  it('merges overlapping findings from two rules into one verified redaction', () => {
    const text = `api_key="${AWS_KEY_SAMPLE}XXXXXXXXXXXXXXXXXXXXXXXX"`;
    const r = redactSecrets(text, DEFAULT_REDACTION_POLICY, 'tool-output');
    expect(r.redactedText).not.toContain(AWS_KEY_SAMPLE);
    expect(r.fullyRedacted).toBe(true);
  });

  it('is idempotent: a second pass over redacted output finds nothing', () => {
    const text = `password="${BARE_SECRET}"\nbare ${BARE_SECRET}\n`;
    const once = redactSecrets(text, DEFAULT_REDACTION_POLICY, 'tool-output');
    expect(detectSecrets(once.redactedText, 'tool-output')).toEqual([]);
  });
});

describe('detectSecrets: exact offsets for captured values', () => {
  it('reports the captured value span, not a first-occurrence guess', () => {
    const value = 'a'.repeat(40);
    const text = `prefix\napi_key = "${value}"\n`;
    const [finding] = detectSecrets(text, 'tool-output');
    expect(finding).toBeDefined();
    expect(finding?.location.offset).toBe(text.indexOf(value));
    expect(finding?.location.length).toBe(value.length);
  });
});
