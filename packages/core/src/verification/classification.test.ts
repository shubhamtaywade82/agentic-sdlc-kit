// packages/core/src/verification/classification.test.ts
//
// Every classification rule in classification.ts is exercised here with
// realistic runner output (ADR-0018 P1: task-scoped Red evidence). The
// rules are explicit and tested, not heuristic: unknown output falls
// through to `unclassified`, which NEVER counts as Red.
import { describe, expect, it } from 'vitest';
import { classifyFailure } from './classification.js';

const base = { exitCode: 1, output: '', timedOut: false };

describe('classifyFailure', () => {
  it('classifies spawn errors as environment', () => {
    const res = classifyFailure({ ...base, spawnError: 'spawn vitest ENOENT' });
    expect(res.classification).toBe('environment');
  });

  it('classifies command-not-found output as environment', () => {
    const res = classifyFailure({ ...base, output: '/bin/sh: foo: command not found' });
    expect(res.classification).toBe('environment');
  });

  it('classifies permission failures as environment', () => {
    const res = classifyFailure({ ...base, output: 'EACCES: permission denied, open /x' });
    expect(res.classification).toBe('environment');
  });

  it('classifies timeouts as timeout', () => {
    const res = classifyFailure({
      exitCode: 124,
      output: 'Timed out: tests were running',
      timedOut: true,
    });
    expect(res.classification).toBe('timeout');
  });

  it('classifies unresolved module imports as dependency', () => {
    const res = classifyFailure({ ...base, output: "Error: Cannot find module 'left-pad'" });
    expect(res.classification).toBe('dependency');
  });

  it('classifies ERR_MODULE_NOT_FOUND as dependency', () => {
    const res = classifyFailure({
      ...base,
      output: "node:internal/modules/cjs/loader:1234 throw err; Error [ERR_MODULE_NOT_FOUND]: Cannot find package",
    });
    expect(res.classification).toBe('dependency');
  });

  it('classifies webpack module-not-found as dependency', () => {
    const res = classifyFailure({
      ...base,
      output: "ERROR in ./src/a.ts Module not found: Error: Can't resolve './missing'",
    });
    expect(res.classification).toBe('dependency');
  });

  it('classifies zero-test runs as discovery', () => {
    const res = classifyFailure({ ...base, output: 'No tests found, exiting with code 1' });
    expect(res.classification).toBe('discovery');
  });

  it('classifies the jest zero-test guard as discovery', () => {
    const res = classifyFailure({
      ...base,
      output: 'Your test suite must contain at least one test.',
    });
    expect(res.classification).toBe('discovery');
  });

  it('classifies node:assert failures as assertion', () => {
    const res = classifyFailure({
      ...base,
      output: 'AssertionError [ERR_ASSERTION]: expected values to be strictly equal',
    });
    expect(res.classification).toBe('assertion');
  });

  it('classifies jest/vitest diff output as assertion', () => {
    const res = classifyFailure({
      ...base,
      output: 'expect(received).toBe(expected) // Object.is equality',
    });
    expect(res.classification).toBe('assertion');
  });

  it('classifies vitest failing-file banners as assertion', () => {
    const res = classifyFailure({
      ...base,
      output: 'FAIL  src/feature.test.ts [ src/feature.test.ts ]\nTest Files  1 failed (1)',
    });
    expect(res.classification).toBe('assertion');
  });

  it('classifies jest summary lines as assertion', () => {
    const res = classifyFailure({ ...base, output: 'Tests:       1 failed, 2 passed, 3 total' });
    expect(res.classification).toBe('assertion');
  });

  it('classifies tsc diagnostics as compilation', () => {
    const res = classifyFailure({
      ...base,
      output: "src/a.ts(12,5): error TS2304: Cannot find name 'missing'.",
    });
    expect(res.classification).toBe('compilation');
  });

  it('classifies syntax errors as compilation', () => {
    const res = classifyFailure({
      ...base,
      output: "SyntaxError: Unexpected token '}' in a.ts",
    });
    expect(res.classification).toBe('compilation');
  });

  it('classifies vite build failures as compilation', () => {
    const res = classifyFailure({ ...base, output: 'Build failed: error during build: RollupError' });
    expect(res.classification).toBe('compilation');
  });

  it('prefers assertion over compilation when both appear (the test ran and failed)', () => {
    const res = classifyFailure({
      ...base,
      output: [
        'AssertionError: expected 1 to be 2',
        '  at Test.run (a.test.ts:3:5)',
        'src/other.ts(9,1): error TS2345: warning-level diagnostic in same run',
      ].join('\n'),
    });
    expect(res.classification).toBe('assertion');
  });

  it('prefers dependency over compilation for unresolved modules', () => {
    const res = classifyFailure({
      ...base,
      output: "a.test.ts:1:20 - error TS2307: Cannot find module 'left-pad' or its corresponding type declarations.",
    });
    expect(res.classification).toBe('dependency');
  });

  it('classifies unrecognized output as unclassified (fail closed)', () => {
    const res = classifyFailure({ ...base, output: 'something completely unknown happened', exitCode: 3 });
    expect(res.classification).toBe('unclassified');
    expect(res.reason).toContain('refusing to count as Red');
  });

  it('classifies empty output as unclassified (fail closed)', () => {
    const res = classifyFailure({ ...base, output: '' });
    expect(res.classification).toBe('unclassified');
  });

  it('reports a human-readable reason for every classification', () => {
    for (const output of [
      'AssertionError: boom',
      'error TS2304: boom',
      "Cannot find module 'x'",
      'No tests found',
      'spawn x ENOENT',
    ]) {
      const res = classifyFailure({ ...base, output });
      expect(res.reason.length).toBeGreaterThan(0);
      expect(res.reason).not.toContain('undefined');
    }
  });
});
