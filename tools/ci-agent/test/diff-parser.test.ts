// tools/ci-agent/test/diff-parser.test.ts
//
// Offline tests for unified-diff parsing and prompt rendering (no I/O).

import { assert, assertEqual, type Registrar } from './harness.js';
import { capFiles, parseUnifiedDiff, renderFileForPrompt, rightSideLines } from '../src/diff-parser.js';

const SAMPLE = [
  'diff --git a/packages/foo/src/a.ts b/packages/foo/src/a.ts',
  '--- a/packages/foo/src/a.ts',
  '+++ b/packages/foo/src/a.ts',
  '@@ -1,3 +1,4 @@',
  ' ctx line',
  '-old line',
  '+new line',
  '+added line',
  'diff --git a/logo.png b/logo.png',
  'Binary files a/logo.png and b/logo.png differ',
].join('\n');

export function register(t: Registrar): void {
  t('diff-parser: parses paths, counts, and right-side anchors', () => {
    const files = parseUnifiedDiff(SAMPLE);
    assertEqual(files.length, 2, 'two files parsed');
    const first = files[0] as (typeof files)[number];
    assertEqual(first.path, 'packages/foo/src/a.ts', 'path from +++/b side');
    assertEqual(first.additions, 2, 'additions counted');
    assertEqual(first.deletions, 1, 'deletions counted');
    const lines = rightSideLines(first);
    assert(lines.has(1), 'context line anchored on the right side');
    assert(lines.has(2), 'first added line anchored');
    assert(lines.has(3), 'second added line anchored');
    assert(!lines.has(99), 'absent line number not anchored');
    assert(!lines.has(0), 'deleted lines have no right-side anchor');
  });

  t('diff-parser: flags binary files', () => {
    const files = parseUnifiedDiff(SAMPLE);
    const second = files[1] as (typeof files)[number];
    assertEqual(second.path, 'logo.png', 'binary file path');
    assertEqual(second.isBinary, true, 'binary flag');
    assertEqual(second.hunks.length, 0, 'no hunks in binary diffs');
  });

  t('diff-parser: capFiles limits the review set and reports the rest', () => {
    const files = parseUnifiedDiff(SAMPLE);
    const capped = capFiles(files, 1);
    assertEqual(capped.files.length, 1, 'capped to one file');
    assertEqual(capped.files[0]?.path, 'packages/foo/src/a.ts', 'order preserved');
    assertEqual(capped.skipped, 1, 'skipped count reported');
  });

  t('diff-parser: renderFileForPrompt shows anchors and truncates oversized renders', () => {
    const files = parseUnifiedDiff(SAMPLE);
    const rendered = renderFileForPrompt(files[0] as (typeof files)[number], 10_000);
    assert(rendered.includes('File: packages/foo/src/a.ts'), 'header includes path');
    assert(rendered.includes('L1'), 'right-side anchor L1 shown');
    assert(rendered.includes('+new line'), 'added content shown');
    const tiny = renderFileForPrompt(files[0] as (typeof files)[number], 10);
    assert(tiny.includes('truncated'), 'oversized render is truncated');
  });
}
