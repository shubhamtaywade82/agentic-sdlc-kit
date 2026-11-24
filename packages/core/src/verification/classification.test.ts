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

  // --- Ruby / RSpec / Minitest (ADR-0018 P1: the Ruby stack packs ship
  // `bundle exec rspec`; the gate must recognize a real RSpec/Minitest
  // failure as Red, and must NOT recognize a green or errored run as Red). ---

  it('classifies RSpec Failure/Error blocks as assertion', () => {
    const res = classifyFailure({
      ...base,
      output: [
        'Failures:',
        '',
        '  1) Widget validates presence of name',
        '     Failure/Error: expect(widget.name).to be_present',
        "       expected `nil` to be present",
        '     # ./spec/models/widget_spec.rb:5',
      ].join('\n'),
    });
    expect(res.classification).toBe('assertion');
  });

  it('classifies the RSpec summary line as assertion', () => {
    const res = classifyFailure({
      ...base,
      output: 'Finished in 0.5 seconds\n52 examples, 1 failure',
    });
    expect(res.classification).toBe('assertion');
  });

  it('classifies the Minitest summary line as assertion', () => {
    const res = classifyFailure({
      ...base,
      output: '2 runs, 2 assertions, 1 failures, 0 errors, 0 skips',
    });
    expect(res.classification).toBe('assertion');
  });

  it('does NOT classify a green RSpec summary (0 failures) as assertion', () => {
    // A passing run exits 0 and is never classified, but defensively the
    // pattern requires failures >= 1 so `0 failures` cannot leak through.
    const res = classifyFailure({ ...base, output: '52 examples, 0 failures' });
    expect(res.classification).not.toBe('assertion');
  });

  it('does NOT classify a Minitest error-only run (0 failures) as assertion', () => {
    // An errored test raised before reaching an assertion; that is not a
    // Red established by an assertion failure — fail closed.
    const res = classifyFailure({
      ...base,
      output: [
        '  1) Error:',
        'WidgetTest#test_name_presence:',
        "NameError: undefined local variable 'foo'",
        '2 runs, 1 assertions, 0 failures, 1 errors, 0 skips',
      ].join('\n'),
    });
    expect(res.classification).not.toBe('assertion');
  });

  it('classifies a bundler missing-spec error as dependency', () => {
    const res = classifyFailure({
      ...base,
      output: "Could not find 'rspec' (>= 0) among 43 total gem(s) (Gem::MissingSpecError)",
    });
    expect(res.classification).toBe('dependency');
  });

  it('classifies Bundler::GemNotFound as dependency', () => {
    const res = classifyFailure({
      ...base,
      output: "Bundler::GemNotFound: Could not find gem 'rspec-rails' in locally installed gems.",
    });
    expect(res.classification).toBe('dependency');
  });

  it('classifies a ruby LoadError as dependency', () => {
    const res = classifyFailure({
      ...base,
      output: "LoadError: cannot load such file -- widget",
    });
    expect(res.classification).toBe('dependency');
  });

  it('prefers assertion over compilation when an RSpec failure and a syntax error both appear', () => {
    // A run where one spec file failed at an assertion and another file
    // had a syntax error: the test that ran and failed wins (assertion).
    const res = classifyFailure({
      ...base,
      output: [
        'SyntaxError: spec/broken_spec.rb:3: syntax error, unexpected keyword_end',
        'Failures:',
        '  1) Widget validates presence of name',
        '     Failure/Error: expect(widget.name).to be_present',
        'Finished in 0.5 seconds\n52 examples, 1 failure',
      ].join('\n'),
    });
    expect(res.classification).toBe('assertion');
  });

  // --- Playwright (frontend e2e; the react-typescript stack pack ships
  // vitest + playwright conventions, so the gate must recognize a real
  // Playwright failure as Red). ---

  it('classifies Playwright locator assertion failures as assertion', () => {
    const res = classifyFailure({
      ...base,
      output: [
        '  1) [chromium] › e2e/smoke.spec.ts:8:5 › increments the counter',
        '',
        '    Error: expect(locator).toHaveText(expected)',
        '',
        "    Locator: getByRole('button', { name: /count is/i })",
        '    Expected string: "Count is 2"',
        '    Received string: "Count is 1"',
      ].join('\n'),
    });
    expect(res.classification).toBe('assertion');
  });

  it('classifies the Playwright reporter summary line as assertion', () => {
    const res = classifyFailure({
      ...base,
      output: [
        '  1 failed',
        '    [chromium] › e2e/smoke.spec.ts:8:5 › increments the counter',
        '  1 passed (2.3s)',
      ].join('\n'),
    });
    expect(res.classification).toBe('assertion');
  });

  it('does NOT classify prose containing "N failed to compile" as assertion', () => {
    // The bare `N failed` pattern is line-anchored: build/tooling prose
    // that merely contains the words must never count as Red.
    const res = classifyFailure({ ...base, output: '3 failed to compile in src/' });
    expect(res.classification).not.toBe('assertion');
  });

  // --- Python / pytest and Go (the python and go stack packs ship
  // `python3 -m pytest` and `go test`, so the gate must recognize a real
  // pytest or go-test failure as Red, and must NOT recognize green,
  // errored, or build-broken runs as Red). ---

  it('classifies the pytest FAILURES banner as assertion', () => {
    const res = classifyFailure({
      ...base,
      output: [
        '=================================== FAILURES ===================================',
        '_________________________________ test_withdraw ________________________________',
        '',
        '    def test_withdraw():',
        '        account = Account(balance=100)',
        '>       account.withdraw(150)',
        'E       assert 100 >= 150',
        '',
        'test_account.py:7: AssertionError',
        '=========================== short summary info ===========================',
      ].join('\n'),
    });
    expect(res.classification).toBe('assertion');
  });

  it('classifies the pytest summary line as assertion', () => {
    const res = classifyFailure({ ...base, output: '1 failed, 2 passed in 0.12s' });
    expect(res.classification).toBe('assertion');
  });

  it('classifies a pytest run where everything failed as assertion', () => {
    const res = classifyFailure({ ...base, output: '1 failed in 0.05s' });
    expect(res.classification).toBe('assertion');
  });

  it('does NOT classify a green pytest summary as assertion', () => {
    // A passing run exits 0 and is never classified, but defensively the
    // pattern requires the failing count to be >= 1.
    const res = classifyFailure({ ...base, output: '2 passed in 0.12s' });
    expect(res.classification).not.toBe('assertion');
  });

  it('does NOT classify an error-only pytest run (no failed count) as assertion', () => {
    // An errored test raised before reaching an assertion; that is not a
    // Red established by an assertion failure — fail closed.
    const res = classifyFailure({ ...base, output: '1 error in 0.10s' });
    expect(res.classification).not.toBe('assertion');
  });

  it('does NOT classify prose containing "N failed attempts" as assertion', () => {
    // The pytest summary pattern requires "failed" to be followed by a
    // comma or ` in ` on a line that starts with the count; retry/log
    // prose must never count as Red.
    const res = classifyFailure({ ...base, output: '3 failed attempts were made before success' });
    expect(res.classification).not.toBe('assertion');
  });

  it('classifies go test --- FAIL: markers as assertion', () => {
    const res = classifyFailure({
      ...base,
      output: [
        '=== RUN   TestTransfer',
        '    transfer_test.go:12: got 1, want 2',
        '--- FAIL: TestTransfer (0.00s)',
        'FAIL',
        'FAIL\texample.com/ledger\t0.5s',
      ].join('\n'),
    });
    expect(res.classification).toBe('assertion');
  });

  it('does NOT classify a go failure-detail line without a FAIL marker as assertion', () => {
    // `file.go:LINE:` detail lines also appear inside failed runs, but a
    // line WITHOUT its column (and without `--- FAIL:`) proves nothing on
    // its own — a truncated run must stay unclassified (fail closed).
    const res = classifyFailure({ ...base, output: 'transfer_test.go:12: got 1, want 2' });
    expect(res.classification).not.toBe('assertion');
    expect(res.classification).not.toBe('compilation');
  });

  it('classifies go build failures (file.go:line:col) as compilation', () => {
    const res = classifyFailure({
      ...base,
      output: [
        '# example.com/ledger',
        './main.go:5:2: undefined: Foo',
        'FAIL\texample.com/ledger [build failed]',
      ].join('\n'),
    });
    expect(res.classification).toBe('compilation');
  });

  it('prefers assertion over compilation when go output has both a FAIL marker and a build error', () => {
    const res = classifyFailure({
      ...base,
      output: [
        './broken.go:9:1: undefined: helper',
        '--- FAIL: TestTransfer (0.00s)',
        '    transfer_test.go:12: got 1, want 2',
      ].join('\n'),
    });
    expect(res.classification).toBe('assertion');
  });

  it('classifies python ModuleNotFoundError as dependency', () => {
    const res = classifyFailure({
      ...base,
      output: "E   ModuleNotFoundError: No module named 'requests'",
    });
    expect(res.classification).toBe('dependency');
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
