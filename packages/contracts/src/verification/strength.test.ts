// packages/contracts/src/verification/strength.test.ts
import { describe, expect, it } from 'vitest';
import {
  STRENGTH_EVIDENCE_SCHEMA_VERSION,
  StrengthConfigSchema,
  StrengthEvidenceSchema,
  strengthExitCode,
  strengthVerdict,
  type StrengthEvidence,
} from './strength.js';

const validConfig = {
  schemaVersion: STRENGTH_EVIDENCE_SCHEMA_VERSION,
  tool: 'stryker',
  command: ['npx', 'stryker', 'run'],
  reportPath: 'reports/mutation/mutation.json',
  threshold: 60,
  gateMode: 'enforce',
  budgetMs: 300000,
  scope: 'diff',
} as const;

function evidenceWith(overrides: Partial<StrengthEvidence>): StrengthEvidence {
  return StrengthEvidenceSchema.parse({
    schemaVersion: STRENGTH_EVIDENCE_SCHEMA_VERSION,
    tool: 'stryker',
    scope: 'diff',
    status: 'passed',
    score: 80,
    mutantsGenerated: 100,
    mutantsKilled: 80,
    mutantsSurvived: 20,
    threshold: 60,
    gateMode: 'enforce',
    timedOut: false,
    durationMs: 1200,
    command: ['npx', 'stryker', 'run'],
    reportPath: 'reports/mutation/mutation.json',
    ...overrides,
  });
}

describe('StrengthConfigSchema', () => {
  it('accepts a valid config', () => {
    const parsed = StrengthConfigSchema.parse(validConfig);
    expect(parsed.tool).toBe('stryker');
    expect(parsed.gateMode).toBe('enforce');
  });

  it('round-trips through JSON without loss', () => {
    const first = StrengthConfigSchema.parse(validConfig);
    const second = StrengthConfigSchema.parse(JSON.parse(JSON.stringify(first)));
    expect(second).toEqual(first);
  });

  it('rejects an unknown tool', () => {
    expect(() => StrengthConfigSchema.parse({ ...validConfig, tool: 'mutmut' })).toThrow();
  });

  it('rejects a threshold above 100', () => {
    expect(() => StrengthConfigSchema.parse({ ...validConfig, threshold: 101 })).toThrow();
  });

  it('rejects a non-positive budget', () => {
    expect(() => StrengthConfigSchema.parse({ ...validConfig, budgetMs: 0 })).toThrow();
  });

  it('rejects a shell-string command', () => {
    expect(() => StrengthConfigSchema.parse({ ...validConfig, command: 'npx stryker run' })).toThrow();
  });

  it('rejects unknown keys (strict)', () => {
    expect(() => StrengthConfigSchema.parse({ ...validConfig, extra: true })).toThrow();
  });

  it('rejects a missing key', () => {
    const { reportPath: _reportPath, ...missing } = validConfig;
    expect(() => StrengthConfigSchema.parse(missing)).toThrow();
  });
});

describe('StrengthEvidenceSchema', () => {
  it('accepts measured evidence', () => {
    const e = evidenceWith({});
    expect(e.status).toBe('passed');
    expect(e.score).toBe(80);
  });

  it('accepts unmeasured evidence with a null score', () => {
    const e = evidenceWith({ status: 'blocked', score: null });
    expect(e.score).toBeNull();
  });

  it('rejects a score outside 0-100', () => {
    expect(() => evidenceWith({ score: 150 })).toThrow();
  });

  it('rejects negative mutant counts', () => {
    expect(() => evidenceWith({ mutantsKilled: -1 })).toThrow();
  });

  it('rejects unknown keys (strict)', () => {
    expect(() => StrengthEvidenceSchema.parse({ ...evidenceWith({}), extra: true })).toThrow();
  });
});

describe('strengthVerdict', () => {
  it('passes when measured at or above the threshold', () => {
    expect(strengthVerdict(evidenceWith({ score: 60, status: 'passed' }))).toBe('passed');
  });

  it('fails when measured below the threshold', () => {
    expect(strengthVerdict(evidenceWith({ score: 59.9, status: 'failed' }))).toBe('failed');
  });

  it('is blocked when the score was never measured', () => {
    expect(strengthVerdict(evidenceWith({ status: 'blocked', score: null }))).toBe('blocked');
    expect(strengthVerdict(evidenceWith({ status: 'skipped', score: null }))).toBe('blocked');
  });

  it('fails closed on inconsistent evidence: passed status without a measured score', () => {
    expect(strengthVerdict(evidenceWith({ status: 'passed', score: null }))).toBe('blocked');
  });

  it('fails closed on inconsistent evidence: failed status above the threshold', () => {
    expect(strengthVerdict(evidenceWith({ status: 'failed', score: 80 }))).toBe('blocked');
  });
});

describe('strengthExitCode', () => {
  it('exits 0 on passed in both modes', () => {
    expect(strengthExitCode('passed', 'enforce')).toBe(0);
    expect(strengthExitCode('passed', 'warn')).toBe(0);
  });

  it('exits 1 on failed only in enforce mode', () => {
    expect(strengthExitCode('failed', 'enforce')).toBe(1);
    expect(strengthExitCode('failed', 'warn')).toBe(0);
  });

  it('exits 1 on blocked in both modes: no measurement is an error, never a pass', () => {
    expect(strengthExitCode('blocked', 'enforce')).toBe(1);
    expect(strengthExitCode('blocked', 'warn')).toBe(1);
  });
});
