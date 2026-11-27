// packages/core/src/tdd/strength.test.ts
//
// Offline tests for the strength machinery (ADR-0022): tool resolution,
// command building (diff scope), budget-capped execution, per-tool
// output parsing, and the fail-closed paths (unsupported stack,
// unparsable report, timeout → incomplete — never a fabricated score).

import { describe, expect, it } from 'vitest';
import type { StrengthSettings, StrengthEvidence } from '@agentic-sdlc-kit/contracts';
import {
  buildStrengthCommand,
  mutationToolForStack,
  parseMutationScore,
  runStrengthCheck,
  type StrengthExecutor,
} from './strength.js';

const SETTINGS: StrengthSettings = {
  enabled: true,
  threshold: 60,
  budgetMs: 300_000,
  scope: 'diff',
  gateMode: 'warn',
};

describe('mutationToolForStack', () => {
  it('resolves every documented stack to its tool', () => {
    expect(mutationToolForStack('node-typescript')?.tool).toBe('stryker');
    expect(mutationToolForStack('react-spa')?.tool).toBe('stryker'); // alias
    expect(mutationToolForStack('react-typescript')?.tool).toBe('stryker');
    expect(mutationToolForStack('python')?.tool).toBe('mutmut');
    expect(mutationToolForStack('ruby-rails')?.tool).toBe('mutant');
    expect(mutationToolForStack('go')?.tool).toBe('go-mutesting');
    expect(mutationToolForStack('rust')?.tool).toBe('cargo-mutants');
    expect(mutationToolForStack('dotnet')?.tool).toBe('stryker-net');
  });

  it('adapts the stryker command to the package manager', () => {
    expect(mutationToolForStack('node-typescript')?.command).toEqual([
      'pnpm',
      'exec',
      'stryker',
      'run',
    ]);
    expect(mutationToolForStack('node-typescript', { packageManager: 'npm' })?.command).toEqual([
      'npm',
      'exec',
      'stryker',
      'run',
    ]);
  });

  it('returns undefined for unsupported stacks (never a silent skip)', () => {
    expect(mutationToolForStack('haskell')).toBeUndefined();
  });
});

describe('buildStrengthCommand (diff scope)', () => {
  const spec = mutationToolForStack('node-typescript')!;

  it('restricts stryker to the scoped files in diff mode', () => {
    const cmd = buildStrengthCommand(spec, 'diff', ['src/a.ts', 'src/b.ts']);
    expect(cmd).toEqual(['pnpm', 'exec', 'stryker', 'run', '--mutate', 'src/a.ts,src/b.ts']);
  });

  it('falls back to the full run when diff has no files', () => {
    expect(buildStrengthCommand(spec, 'diff', [])).toEqual(['pnpm', 'exec', 'stryker', 'run']);
    expect(buildStrengthCommand(spec, 'suite', ['src/a.ts'])).toEqual([
      'pnpm',
      'exec',
      'stryker',
      'run',
    ]);
  });
});

describe('parseMutationScore (offline fixture parsing)', () => {
  it('parses StrykerJS output', () => {
    const output = [
      'All tests            10          10          0           0        0',
      'All mutants           50',
      'Killed: 36',
      'Survived: 14',
      'Mutation score based on covered code: 71.43%',
    ].join('\n');
    expect(parseMutationScore('stryker', output)).toEqual({
      score: 71,
      killed: 36,
      generated: 50,
    });
  });

  it('parses mutmut final table ratio', () => {
    expect(parseMutationScore('mutmut', 'Killed 30 of 50 mutants\n30/50')).toEqual({
      score: 60,
      killed: 30,
      generated: 50,
    });
  });

  it('parses mutant (ruby) output', () => {
    const output = 'Killed: 28\nAlive: 14\nMutation score : 66.67%';
    expect(parseMutationScore('mutant', output)).toEqual({
      score: 67,
      killed: 28,
      generated: 42,
    });
  });

  it('parses go-mutesting output', () => {
    expect(parseMutationScore('go-mutesting', 'The mutation score is 0.750000 (30/40)')).toEqual({
      score: 75,
      killed: 30,
      generated: 40,
    });
  });

  it('parses cargo-mutants output', () => {
    const output = '40 mutants tested: 30 killed\nmutation score: 75.00%';
    expect(parseMutationScore('cargo-mutants', output)).toEqual({
      score: 75,
      killed: 30,
      generated: 40,
    });
  });

  it('parses Stryker.NET output', () => {
    const output = 'Killed: 36\nSurvived: 14\nmutation score: 72.00%';
    expect(parseMutationScore('stryker-net', output)).toEqual({
      score: 72,
      killed: 36,
      generated: 50,
    });
  });

  it('returns null for an unparsable report — never a guessed score', () => {
    expect(parseMutationScore('stryker', 'tool crashed unexpectedly')).toBeNull();
    expect(parseMutationScore('cargo-mutants', '')).toBeNull();
  });
});

/** Fake executor factory for offline runs. */
function fakeExecutor(outcome: Partial<Awaited<ReturnType<StrengthExecutor>>>): StrengthExecutor {
  return async () => ({
    exitCode: 0,
    output: '',
    timedOut: false,
    durationMs: 1_000,
    ...outcome,
  });
}

describe('runStrengthCheck', () => {
  it('records a passing score from a parsed report', async () => {
    const res = await runStrengthCheck({
      cwd: '/tmp',
      stack: 'node-typescript',
      settings: SETTINGS,
      scopeFiles: ['src/a.ts'],
      taskId: 'TASK-001',
      executor: fakeExecutor({
        output: 'Killed: 36\nSurvived: 14\nMutation score based on covered code: 71.43%',
      }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('passed');
      expect(res.value.score).toBe(71);
      expect(res.value.mutantsKilled).toBe(36);
      expect(res.value.mutantsGenerated).toBe(50);
      expect(res.value.taskId).toBe('TASK-001');
      expect(res.value.scopeFiles).toEqual(['src/a.ts']);
    }
  });

  it('records failed below threshold without fabricating anything', async () => {
    const res = await runStrengthCheck({
      cwd: '/tmp',
      stack: 'node-typescript',
      settings: { ...SETTINGS, threshold: 90 },
      executor: fakeExecutor({
        output: 'Killed: 36\nSurvived: 14\nMutation score based on covered code: 71.43%',
      }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('failed');
      expect(res.value.score).toBe(71);
    }
  });

  it('records incomplete on timeout — the budget is a hard cap, never a hang', async () => {
    const res = await runStrengthCheck({
      cwd: '/tmp',
      stack: 'node-typescript',
      settings: { ...SETTINGS, budgetMs: 5 },
      executor: fakeExecutor({ timedOut: true, exitCode: 124, durationMs: 5 }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('incomplete');
      expect(res.value.score).toBeUndefined();
      expect(res.value.summary).toContain('budgetMs');
    }
  });

  it('records incomplete when the tool is missing (spawn error)', async () => {
    const res = await runStrengthCheck({
      cwd: '/tmp',
      stack: 'python',
      settings: SETTINGS,
      executor: fakeExecutor({ exitCode: null, spawnError: 'spawn mutmut ENOENT' }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('incomplete');
      expect(res.value.summary).toContain('unavailable');
    }
  });

  it('records incomplete when the report cannot be parsed', async () => {
    const res = await runStrengthCheck({
      cwd: '/tmp',
      stack: 'rust',
      settings: SETTINGS,
      executor: fakeExecutor({ output: 'build failed', exitCode: 101 }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('incomplete');
      expect(res.value.summary).toContain('could not be parsed');
    }
  });

  it('fails closed for a stack without an adapter', async () => {
    const res = await runStrengthCheck({
      cwd: '/tmp',
      stack: 'haskell',
      settings: SETTINGS,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('not supported');
  });

  it('produces evidence that satisfies the wire contract', async () => {
    const { StrengthEvidenceSchema } = await import('@agentic-sdlc-kit/contracts');
    const res = await runStrengthCheck({
      cwd: '/tmp',
      stack: 'node-typescript',
      settings: SETTINGS,
      executor: fakeExecutor({
        output: 'Killed: 36\nSurvived: 14\nMutation score based on covered code: 71.43%',
      }),
    });
    expect(res.ok).toBe(true);
    const parsed = StrengthEvidenceSchema.safeParse(res.value);
    expect(parsed.success).toBe(true);
  });
});

describe('strength evidence in the TDD machine (transition audit)', () => {
  it('latestStrength returns the most recent measurement', async () => {
    const { TddSession } = await import('./cycle.js');
    const session = new TddSession('TASK-001');
    expect(session.recordStrength(fakeEvidence(71)).ok).toBe(false); // not completed yet
    session.advance({ status: 'failed', verification: fakeVerification('assertion') });
    session.advance({ status: 'passed', verification: fakeVerification(null) });
    session.advance({ status: 'passed', verification: fakeVerification(null) });
    expect(session.getCurrentPhase()).toBe('completed');
    expect(session.recordStrength(fakeEvidence(50)).ok).toBe(true);
    expect(session.recordStrength(fakeEvidence(75)).ok).toBe(true);
    const latest: StrengthEvidence | undefined = session.latestStrength();
    expect(latest?.score).toBe(75);
    // history is preserved: 3 phase records + 2 strength records
    expect(session.getHistory().length).toBe(5);
  });
});

function fakeVerification(classification: string | null): never {
  return {
    taskId: 'TASK-001',
    command: ['node', '--test'],
    classification,
    reason: 'test',
  } as never;
}

function fakeEvidence(score: number): StrengthEvidence {
  return {
    schemaVersion: 1,
    tool: 'stryker',
    status: score >= 60 ? 'passed' : 'failed',
    score,
    mutantsGenerated: 50,
    mutantsKilled: Math.round((score / 100) * 50),
    mutantsSurvived: 50 - Math.round((score / 100) * 50),
    threshold: 60,
    scope: 'diff',
    scopeFiles: [],
    durationMs: 1_000,
    budgetMs: 300_000,
    summary: `mutation score ${score}%`,
  };
}
