// packages/contracts/src/verification/strength.test.ts
//
// Offline contract tests for StrengthEvidence: schema invariants,
// score computation, and gate evaluation (ADR-0022).

import { describe, expect, it } from 'vitest';
import {
  computeMutationScore,
  evaluateStrengthGate,
  MutationToolSchema,
  resolveStrengthStatus,
  StrengthEvidenceSchema,
  StrengthSettingsSchema,
} from './strength.js';

function validEvidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    tool: 'stryker',
    status: 'passed',
    score: 72,
    mutantsGenerated: 50,
    mutantsKilled: 36,
    mutantsSurvived: 14,
    threshold: 60,
    scope: 'diff',
    scopeFiles: ['src/index.ts'],
    durationMs: 12_000,
    budgetMs: 300_000,
    summary: '36/50 mutants killed (72% >= 60%)',
    ...overrides,
  };
}

describe('StrengthEvidenceSchema', () => {
  it('accepts a valid completed run', () => {
    const parsed = StrengthEvidenceSchema.safeParse(validEvidence());
    expect(parsed.success).toBe(true);
  });

  it('accepts an incomplete run without a score', () => {
    const parsed = StrengthEvidenceSchema.safeParse(
      validEvidence({
        status: 'incomplete',
        mutantsGenerated: 0,
        mutantsKilled: 0,
        mutantsSurvived: 0,
        score: undefined,
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects a completed run without a score', () => {
    const parsed = StrengthEvidenceSchema.safeParse(validEvidence({ score: undefined }));
    expect(parsed.success).toBe(false);
  });

  it('rejects an incomplete run that fabricates a score', () => {
    const parsed = StrengthEvidenceSchema.safeParse(validEvidence({ status: 'incomplete' }));
    expect(parsed.success).toBe(false);
  });

  it('rejects killed + survived exceeding generated mutants', () => {
    const parsed = StrengthEvidenceSchema.safeParse(
      validEvidence({ mutantsKilled: 40, mutantsSurvived: 20 }),
    );
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown mutation tool', () => {
    const parsed = StrengthEvidenceSchema.safeParse(validEvidence({ tool: 'cosmic-ray' }));
    expect(parsed.success).toBe(false);
  });

  it('rejects unknown extra fields (strict shape)', () => {
    const parsed = StrengthEvidenceSchema.safeParse(validEvidence({ extra: 'no' }));
    expect(parsed.success).toBe(false);
  });
});

describe('MutationToolSchema', () => {
  it('accepts every documented adapter tool', () => {
    for (const tool of [
      'stryker',
      'mutmut',
      'mutant',
      'go-mutesting',
      'gremlins',
      'cargo-mutants',
      'stryker-net',
    ]) {
      expect(MutationToolSchema.safeParse(tool).success).toBe(true);
    }
  });
});

describe('StrengthSettingsSchema', () => {
  it('accepts the documented settings surface', () => {
    const parsed = StrengthSettingsSchema.safeParse({
      enabled: true,
      threshold: 60,
      budgetMs: 300_000,
      scope: 'diff',
      gateMode: 'enforce',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an out-of-range threshold', () => {
    expect(StrengthSettingsSchema.safeParse({ threshold: 101 }).success).toBe(false);
  });
});

describe('computeMutationScore', () => {
  it('computes a rounded percentage', () => {
    expect(computeMutationScore(36, 50)).toBe(72);
    expect(computeMutationScore(1, 3)).toBe(33);
    expect(computeMutationScore(0, 10)).toBe(0);
  });

  it('returns null when no mutants were generated', () => {
    expect(computeMutationScore(0, 0)).toBeNull();
  });
});

describe('resolveStrengthStatus', () => {
  it('passes at threshold, fails below it', () => {
    expect(resolveStrengthStatus(60, 60)).toBe('passed');
    expect(resolveStrengthStatus(59.6, 60)).toBe('failed');
  });

  it('treats an unmeasurable suite as incomplete', () => {
    expect(resolveStrengthStatus(null, 60)).toBe('incomplete');
  });
});

describe('evaluateStrengthGate', () => {
  it('warn mode never blocks, including on failure and incomplete', () => {
    expect(evaluateStrengthGate({ status: 'failed', score: 40 }, 'warn').block).toBe(false);
    expect(evaluateStrengthGate({ status: 'incomplete' }, 'warn').block).toBe(false);
  });

  it('enforce mode blocks below threshold', () => {
    const gate = evaluateStrengthGate({ status: 'failed', score: 40 }, 'enforce');
    expect(gate.block).toBe(true);
    expect(gate.reason).toContain('below the threshold');
  });

  it('enforce mode fail-closes on an incomplete run', () => {
    const gate = evaluateStrengthGate({ status: 'incomplete' }, 'enforce');
    expect(gate.block).toBe(true);
    expect(gate.reason).toContain('incomplete');
  });

  it('enforce mode passes a meeting score', () => {
    const gate = evaluateStrengthGate({ status: 'passed', score: 60 }, 'enforce');
    expect(gate.block).toBe(false);
  });
});
