// tools/ci-agent/test/log-minimizer.test.ts
//
// Offline tests for CI-log minimization (ANSI stripping, error frames,
// repo-path mapping) — plain strings in, plain strings out.

import { assert, assertEqual, type Registrar } from './harness.js';
import { extractErrorFrames, mapFilePaths, minimizeJobLog, stripAnsi } from '../src/log-minimizer.js';

export function register(t: Registrar): void {
  t('log-minimizer: strips ANSI control sequences', () => {
    const dirty = `\u001b[31merror\u001b[0m in \u001b[1mpackages/cli/src/index.ts\u001b[0m`;
    assertEqual(stripAnsi(dirty), 'error in packages/cli/src/index.ts', 'no escape sequences remain');
  });

  t('log-minimizer: extracts failure frames with context', () => {
    const lines = [
      'build started',
      'ERROR: type mismatch in cli',
      'detail one',
      'detail two',
      'separator',
      'padding',
      'more padding',
      'AssertionError: expected 1 to equal 2',
      'at run (packages/cli/src/run.ts:10:5)',
      'trailer',
    ];
    const frames = extractErrorFrames(lines.join('\n'), 12, 2);
    assertEqual(frames.length, 2, 'two separated failure windows (gap between them)');
    assert(frames[0]?.includes('ERROR: type mismatch'), 'first frame keeps the error line');
    assert(frames[0]?.includes('1: build started'), 'frames are 1-indexed with context');
    assert(frames[1]?.includes('AssertionError'), 'second frame keeps its failure line');
  });

  t('log-minimizer: caps the number of frames', () => {
    const log = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? `error strike ${i}` : 'padding')).join('\n');
    const all = extractErrorFrames(log, 3, 1).join('\n');
    assert(all.includes('error strike 0') && all.includes('error strike 4'), 'first three failure frames kept');
    assert(!all.includes('error strike 6'), 'failures beyond the frame cap are dropped');
  });

  t('log-minimizer: maps repository paths printed by tooling', () => {
    const log =
      'failed at packages/cli/src/commands/skills.ts:12:34\n' +
      'also see plugins/run-observer/hooks/register.ts\n' +
      'node_modules/typescript/lib/typescript.js is ignored';
    const paths = mapFilePaths(log, 10);
    assertEqual(paths.length, 2, 'only repo-shaped paths are kept');
    assertEqual(paths[0], 'packages/cli/src/commands/skills.ts', 'line/column suffix stripped');
    assertEqual(paths[1], 'plugins/run-observer/hooks/register.ts');
  });

  t('log-minimizer: minimizeJobLog falls back to truncation when no failure lines exist', () => {
    const quiet = Array.from({ length: 50 }, (_, i) => `noise ${i}`).join('\n');
    const minimized = minimizeJobLog(quiet, 80);
    assert(minimized.length <= 80 + '…(log truncated)'.length + 1, 'capped at maxChars');
    assert(minimized.includes('truncated'), 'explicit truncation marker (never silent)');
  });

  t('log-minimizer: minimizeJobLog keeps error frames within budget', () => {
    const log = 'before\nERROR: boom\nafter';
    const minimized = minimizeJobLog(log, 400);
    assert(minimized.includes('ERROR: boom'), 'failure line survives minimization');
    assert(minimized.includes('before') && minimized.includes('after'), 'context lines survive');
  });
}
