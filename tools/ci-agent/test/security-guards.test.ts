// tools/ci-agent/test/security-guards.test.ts
//
// Offline tests for the bounded-write policy (invariant 4): only
// packages/<pkg>/src/** is patchable; workflows, manifests, lockfiles,
// configs, and host-instruction files are hard-denied.

import { assert, assertEqual, type Registrar } from './harness.js';
import { filterEdits, pathVerdict } from '../src/security-guards.js';

const okPath = 'packages/cli/src/commands/skills.ts';

export function register(t: Registrar): void {
  t('guards: patchable package source is allowed', () => {
    assertEqual(pathVerdict(okPath).allowed, true, 'package source allowed');
    assertEqual(pathVerdict('packages/core/src/deep/nested/file.ts').allowed, true, 'nested source allowed');
    assertEqual(pathVerdict('packages/cli/src/index.test.ts').allowed, true, 'tests under src allowed');
  });

  t('guards: workflow and policy files are hard-denied', () => {
    const verdict = pathVerdict('.github/workflows/ci.yml');
    assertEqual(verdict.allowed, false, 'workflows denied');
    assert(verdict.reason?.includes('workflow') ?? false, 'denial reason mentions workflows');
  });

  t('guards: manifests, lockfiles, configs, env, and host instructions are denied', () => {
    for (const denied of [
      'package.json',
      'packages/cli/package.json',
      'packages/cli/src/package.json',
      'pnpm-lock.yaml',
      'tools/ci-agent/package-lock.json',
      'pnpm-workspace.yaml',
      'packages/cli/tsconfig.json',
      '.env',
      'packages/cli/.env.local',
      'eslint.config.js',
      '.prettierrc',
      'AGENTS.md',
      'GEMINI.md',
    ]) {
      assertEqual(pathVerdict(denied).allowed, false, `denied: ${denied}`);
    }
  });

  t('guards: anything outside packages/<pkg>/src/** is out of scope', () => {
    const verdict = pathVerdict('tools/ci-agent/src/llm.ts');
    assertEqual(verdict.allowed, false, 'agent itself is not patchable');
    assert(verdict.reason?.includes('outside') ?? false, 'reason names the allowlist');
    assertEqual(pathVerdict('README.md').allowed, false, 'docs out of scope');
    assertEqual(pathVerdict('plugins/run-observer/hooks/register.ts').allowed, false, 'plugins out of scope');
  });

  t('guards: filterEdits accepts a clean edit and preserves it', () => {
    const { accepted, rejected } = filterEdits([
      { path: okPath, explanation: 'guard the mkdir', oldString: 'const x = 1;', newString: 'const x = 2;' },
    ]);
    assertEqual(accepted.length, 1, 'clean edit accepted');
    assertEqual(rejected.length, 0, 'nothing rejected');
    assertEqual(accepted[0]?.oldString, 'const x = 1;', 'payload preserved');
  });

  t('guards: filterEdits drops no-op and denied edits', () => {
    const { accepted, rejected } = filterEdits([
      { path: okPath, explanation: 'no change', oldString: 'same', newString: 'same' },
      { path: '.github/workflows/ci.yml', explanation: 'sneaky', oldString: 'a', newString: 'b' },
    ]);
    assertEqual(accepted.length, 0, 'nothing accepted');
    assertEqual(rejected.length, 2, 'both rejected');
    assert(rejected[0]?.reason.includes('no-op') ?? false, 'no-op reason');
    assert(rejected[1]?.reason.startsWith('denied:') ?? false, 'denied reason');
  });

  t('guards: filterEdits caps files at 5', () => {
    const edits = Array.from({ length: 6 }, (_, i) => ({
      path: `packages/pkg${i}/src/file${i}.ts`,
      explanation: 'e',
      oldString: 'a',
      newString: 'b',
    }));
    const { accepted, rejected } = filterEdits(edits);
    assertEqual(accepted.length, 5, 'at most five files');
    assertEqual(rejected.length, 1, 'sixth file rejected');
    assert(rejected[0]?.reason.includes('files') ?? false, 'cap reason mentions files');
  });

  t('guards: filterEdits rejects oversized payloads', () => {
    const big = 'x'.repeat(60_001);
    const { accepted, rejected } = filterEdits([
      { path: okPath, explanation: 'e', oldString: big, newString: 'b' },
    ]);
    assertEqual(accepted.length, 0, 'oversized oldString rejected');
    assert(rejected[0]?.reason.includes('exceeds') ?? false, 'size cap reason');
  });
}
