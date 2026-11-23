// packages/core/src/verification/classification.ts
//
// Failure classification for task-targeted verification (ADR-0018 P1
// refinement; ADR-0020 §Evidence is authoritative).
//
// A Red phase may advance ONLY on a failure classified as `assertion`:
// the targeted test ran, was discovered, and failed at an assertion.
// Compilation, dependency, discovery, environment, timeout, and
// unclassified failures must NOT count as Red — "something failed" is
// not "the targeted test failed for the expected reason".
//
// RULES ARE EXPLICIT AND TESTED, not heuristic: every classification
// branch below has a test in classification.test.ts. Unknown output
// falls through to `unclassified`, and unclassified NEVER counts as Red
// (fail closed — prefer a false-negative Red over a false-positive Red).

/**
 * Structured classification of a verification failure.
 *
 * - `assertion`    the targeted test ran and failed at an assertion — the only classification that establishes Red
 * - `compilation`  the build/compile step failed before any test ran
 * - `dependency`   a declared dependency could not be resolved or loaded
 * - `discovery`    the test runner started but found no tests
 * - `environment`  the command could not start (missing executable, permission, bad cwd)
 * - `timeout`      the command exceeded its bounded timeout
 * - `unclassified` none of the above matched; NEVER counts as Red
 */
export type FailureClassification =
  | 'assertion'
  | 'compilation'
  | 'dependency'
  | 'discovery'
  | 'environment'
  | 'timeout'
  | 'unclassified';

export const FAILURE_CLASSIFICATIONS: readonly FailureClassification[] = [
  'assertion',
  'compilation',
  'dependency',
  'discovery',
  'environment',
  'timeout',
  'unclassified',
];

/** Input to classification: exactly what the process runner observes. */
export interface ClassificationInput {
  /** Process exit code; `null` when the process could not start. */
  readonly exitCode: number | null;
  /** Bounded combined stdout+stderr (already captured by the runner). */
  readonly output: string;
  /** True when the runner killed the process for exceeding its timeout. */
  readonly timedOut: boolean;
  /** Spawn-level error message (e.g. `spawn foo ENOENT`), when the process never started. */
  readonly spawnError?: string;
}

export interface ClassificationResult {
  readonly classification: FailureClassification;
  /** Short human-readable derivation, recorded with the evidence. */
  readonly reason: string;
}

interface Rule {
  readonly classification: FailureClassification;
  readonly reason: string;
  /** Order matters: first match wins; see classification.test.ts. */
  readonly matches: (input: ClassificationInput) => boolean;
}

const ENVIRONMENT_PATTERNS: readonly RegExp[] = [
  /spawn\s+\S+\s+ENOENT/, // node child_process: executable not found
  /spawn\s+\S+\s+EACCES/, // executable found but not executable
  /ENOENT:\s*no such file or directory/,
  /EACCES:\s*permission denied/i,
  /command not found/i,
  /MODULE_NOT_FOUND is not defined/, // require of missing local file at runtime top level
];

const DEPENDENCY_PATTERNS: readonly RegExp[] = [
  /Cannot find module ['"][^'"]+['"]/, // node/vitest/jest unresolved import
  /Cannot find package ['"][^'"]+['"]/,
  /Module not found:\s*Error:/, // webpack-style
  /ERR_MODULE_NOT_FOUND/,
  /ERR_PACKAGE_PATH_NOT_EXPORTED/,
  // Ruby / Bundler: a declared gem could not be resolved or loaded. The
  // exception class names are unambiguous (Bundler and rubygems print them
  // verbatim); LoadError covers a `require` of a missing local file.
  /Gem::MissingSpecError/, // bundler: gem not installed / not in lockfile
  /Bundler::GemNotFound/, // bundler: version resolution failure
  /Bundler::VersionConflict/, // bundler: incompatible version constraints
  /LoadError:\s+cannot load such file/, // ruby require of a missing file
];

const DISCOVERY_PATTERNS: readonly RegExp[] = [
  /no tests? found/i,
  /no test files? found/i,
  /Your test suite must contain at least one test/, // jest zero-test guard
  /no test specified/i,
];

const COMPILATION_PATTERNS: readonly RegExp[] = [
  /error TS\d+/, // tsc diagnostics (e.g. error TS2304)
  /SyntaxError:/, // JS/TS parse failure
  /ParseError/,
  /Failed to compile/, // webpack/vite compile banner
  /Transform failed/, // esbuild
  /\(esbuild\)/, // esbuild error suffix
  /error during build/i, // rollup/vite build failure
];

const ASSERTION_PATTERNS: readonly RegExp[] = [
  /AssertionError/, // node:assert + most frameworks
  /assert\s+failed/i,
  /expect\(received\)/, // jest/vitest diff header
  /Expected\s+[<[]\d]/, // jest/vitest diff body
  /✕/, // failing-test marker (jest/vitest reporter)
  / FAIL /, // failing-file banner (jest/vitest reporter)
  /Test Files\s+[^\n]*\bfailed\b/, // vitest summary line
  /Tests:?\s+[^\n]*\bfailed\b/, // jest/vitest summary line (colon optional)
  /tests?\s+\d+\s+failed/i, // generic runner summary
  // RSpec / Minitest: the targeted Ruby test ran and failed at an
  // expectation. `Failure/Error:` is RSpec's per-failure block header
  // (RSpec-only); the summary lines require the failing count to be >= 1
  // so a green run's `0 failures` never counts as Red.
  /Failure\/Error:/, // RSpec per-failure block header
  /[1-9]\d*\s+examples?,\s+[1-9]\d*\s+failures?/, // RSpec summary
  /[1-9]\d*\s+runs?,\s+\d+\s+assertions?,\s+[1-9]\d*\s+failures?/, // Minitest summary
  // Playwright: locator-assertion failure headers and the reporter's bare
  // `N failed` summary line. The summary pattern is line-anchored on both
  // sides so prose such as `3 failed to compile` never counts as Red.
  /expect\(locator\)\./, // Playwright locator assertion header
  /^\s*\d+\s+failed\s*$/m, // bare "N failed" summary line (Playwright reporter)
];

/**
 * Ordered rule table. A failure output is tested against each rule in
 * order; the first match classifies it. Rules that are MORE SPECIFIC to
 * the actual failure mode come first:
 *
 *   environment  — the process never started (nothing ran)
 *   timeout      — the runner killed it (no verdict was reached)
 *   dependency   — module/package resolution failed before tests
 *   discovery    — the runner started but found no tests
 *   assertion    — an explicit test-failure marker
 *   compilation  — a compile/parse error
 *   unclassified — anything else (fail closed)
 *
 * `assertion` intentionally precedes `compilation`: a failing test file
 * whose output contains BOTH an assertion marker and incidental
 * compiler diagnostics (e.g. type errors reported as warnings after the
 * failure) is still an assertion failure — the test ran and failed.
 */
const RULES: readonly Rule[] = [
  {
    classification: 'environment',
    reason: 'command could not start (spawn error)',
    matches: (i) => Boolean(i.spawnError) || ENVIRONMENT_PATTERNS.some((p) => p.test(i.output)),
  },
  {
    classification: 'timeout',
    reason: 'command exceeded its bounded timeout before producing a verdict',
    matches: (i) => i.timedOut,
  },
  {
    classification: 'dependency',
    reason: 'a dependency could not be resolved or loaded',
    matches: (i) => DEPENDENCY_PATTERNS.some((p) => p.test(i.output)),
  },
  {
    classification: 'discovery',
    reason: 'test runner found no tests to execute',
    matches: (i) => DISCOVERY_PATTERNS.some((p) => p.test(i.output)),
  },
  {
    classification: 'assertion',
    reason: 'targeted test executed and failed at an assertion',
    matches: (i) => ASSERTION_PATTERNS.some((p) => p.test(i.output)),
  },
  {
    classification: 'compilation',
    reason: 'compilation or parse failure before tests could run',
    matches: (i) => COMPILATION_PATTERNS.some((p) => p.test(i.output)),
  },
];

/**
 * Classify a FAILED verification command (exit code !== 0 or never ran).
 * Successful commands (exit 0) are classified `null` by the caller —
 * there is nothing to classify.
 */
export function classifyFailure(input: ClassificationInput): ClassificationResult {
  for (const rule of RULES) {
    if (rule.matches(input)) {
      return { classification: rule.classification, reason: rule.reason };
    }
  }
  return {
    classification: 'unclassified',
    reason: 'output matched no known failure pattern; refusing to count as Red',
  };
}
