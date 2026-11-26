// plugins/secret-guard/tests/tool-result-fail-closed.test.ts
//
// Fail-closed contract for the tool-result gate: a secret must never reach
// the model when redaction is unverified, when the result carries a shape the
// gate does not read as text, or when the policy cannot be read.
import { describe, expect, it } from 'vitest';
import { MockRuntime } from '@agentic-sdlc-kit/mod-sdk';
import { register, toolResultText } from '../hooks/register';
import {
  DEFAULT_REDACTION_POLICY,
  redactSecrets,
  type RedactionResult,
} from '../policies/detect';

const AWS_KEY_SAMPLE = 'AKIAIOSFODNNN7EXAMPLE';
const BARE_SECRET = 'hunter2hunter2';
const POLICY_KEY = { plugin: 'secret-guard', key: 'policy' };

async function fireBashResult(runtime: MockRuntime, hostResult: unknown): Promise<unknown> {
  runtime.setHostResult(hostResult);
  const result = await runtime.fire('tool.call', { tool: 'Bash', command: 'cat out.txt' });
  return result.value;
}

describe('tool-result gate: a bare copy of a quoted secret', () => {
  it('never returns the bare copy that span-only redaction would leave behind', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const text = `password="${BARE_SECRET}"\nlater: echo ${BARE_SECRET}\n`;
    const value = (await fireBashResult(runtime, { text })) as { text?: string };
    expect(value.text ?? '').not.toContain(BARE_SECRET);
  });
});

describe('toolResultText: the status-to-output mapping', () => {
  it('returns redacted text when every value was verified gone', () => {
    const r: RedactionResult = {
      redactedText: 'x [REDACTED:k:F-1]',
      findings: [],
      status: 'redacted',
      fullyRedacted: true,
    };
    expect(toolResultText(r)).toBe('x [REDACTED:k:F-1]');
  });

  it('returns verified-clean text unchanged', () => {
    const r = redactSecrets('nothing here', DEFAULT_REDACTION_POLICY, 'tool-output');
    expect(toolResultText(r)).toBe('nothing here');
  });

  it('withholds on failed status and never exposes redactedText', () => {
    const r: RedactionResult = {
      redactedText: `leak ${BARE_SECRET}`,
      findings: [],
      status: 'failed',
      fullyRedacted: false,
    };
    const out = toolResultText(r);
    expect(out).not.toContain(BARE_SECRET);
    expect(out).toMatch(/WITHHELD.*could not be verified/);
  });

  it('withholds on not-scanned status', () => {
    const r = redactSecrets('x'.repeat(10), { ...DEFAULT_REDACTION_POLICY, maxInputChars: 4 }, 'tool-output');
    expect(toolResultText(r)).toMatch(/WITHHELD/);
  });
});

describe('tool-result gate: non-text result shapes', () => {
  it('withholds a secret carried in a non-text field', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const value = await fireBashResult(runtime, { result: { stdout: AWS_KEY_SAMPLE } });
    expect(JSON.stringify(value)).not.toContain(AWS_KEY_SAMPLE);
  });

  it('withholds a secret carried in context entries', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const value = await fireBashResult(runtime, { text: 'ok', context: [`key=${AWS_KEY_SAMPLE}`] });
    expect(JSON.stringify(value)).not.toContain(AWS_KEY_SAMPLE);
  });

  it('passes a clean non-text result through unchanged', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const value = await fireBashResult(runtime, { result: { exitCode: 0 } });
    expect(value).toEqual({ result: { exitCode: 0 } });
  });
});

describe('tool-result gate: scanning limits and policy failure', () => {
  it('scans output exactly at maxInputChars instead of withholding it', async () => {
    const runtime = new MockRuntime();
    runtime.load(register);
    const text = `k=${AWS_KEY_SAMPLE}`;
    runtime.setState(POLICY_KEY, { ...DEFAULT_REDACTION_POLICY, maxInputChars: text.length });
    const value = (await fireBashResult(runtime, { text })) as { text?: string };
    expect(value.text).not.toMatch(/WITHHELD/);
    expect(value.text).not.toContain(AWS_KEY_SAMPLE);
  });

  it('denies when the policy cannot be read (fail closed)', async () => {
    const runtime = new MockRuntime();
    runtime.poisonState('secret-guard', 'policy');
    runtime.load(register);
    const value = (await fireBashResult(runtime, { text: 'hello' })) as { deny?: string };
    expect(value.deny).toMatch(/fail closed|redaction failed/);
  });
});
