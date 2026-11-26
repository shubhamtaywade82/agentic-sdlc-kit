// tools/ci-agent/test/edit-policy.test.ts
//
// Offline tests for the edit pipeline that sits between the model's proposal
// and the GitHub tree API: candidate selection, exact-match verification, and
// the pre-commit path assertion. The GitHub fetch is injected as a spy.

import { assert, assertEqual, assertThrows, type Registrar } from './harness.js';
import {
  applyEdits,
  assertPatchablePaths,
  selectCandidates,
  type CandidateFile,
} from '../src/edit-policy.js';
import type { FixProposal } from '../src/schemas.js';

const FILE = 'packages/core/src/x.ts';
const TRAVERSAL = 'packages/core/src/../../../.github/workflows/ci.yml';
const ORIGINAL = 'const a = 1;\nconst b = 2;\n';

function proposal(edits: FixProposal['edits']): FixProposal {
  return { title: 'fix', body: 'body', edits } as FixProposal;
}

function candidates(...files: Array<[string, string]>): CandidateFile[] {
  return files.map(([path, content]) => ({ path, content }));
}

export function register(t: Registrar): void {
  t('edit-policy: same-file edits fold in order into one final state', () => {
    const result = applyEdits(
      proposal([
        { path: FILE, explanation: 'a', oldString: 'const a = 1;', newString: 'const a = 9;' },
        { path: FILE, explanation: 'b', oldString: 'const b = 2;', newString: 'const b = 8;' },
      ]),
      candidates([FILE, ORIGINAL]),
    );
    assertEqual(result.applied.length, 2, 'both edits applied');
    assertEqual(result.folded.get(FILE), 'const a = 9;\nconst b = 8;\n', 'folded content');
  });

  t('edit-policy: a replacement containing $ patterns is written literally', () => {
    const result = applyEdits(
      proposal([{ path: FILE, explanation: 'x', oldString: 'const a = 1;', newString: 'const a = "$&$1";' }]),
      candidates([FILE, ORIGINAL]),
    );
    assertEqual(result.folded.get(FILE), 'const a = "$&$1";\nconst b = 2;\n', 'no $-pattern expansion');
  });

  t('edit-policy: an oldString that no longer exists is refused as stale', () => {
    const result = applyEdits(
      proposal([{ path: FILE, explanation: 'x', oldString: 'missing line', newString: 'y' }]),
      candidates([FILE, ORIGINAL]),
    );
    assertEqual(result.applied.length, 0, 'nothing applied');
    assert(result.rejected[0]?.reason.includes('stale') ?? false, 'stale reason');
  });

  t('edit-policy: an oldString that matches twice is refused as ambiguous', () => {
    const result = applyEdits(
      proposal([{ path: FILE, explanation: 'x', oldString: 'x', newString: 'y' }]),
      candidates([FILE, 'x\nx\n']),
    );
    assertEqual(result.applied.length, 0, 'nothing applied');
    assert(result.rejected[0]?.reason.includes('ambiguous') ?? false, 'ambiguous reason');
  });

  t('edit-policy: a traversal edit is rejected even when its content is present', () => {
    const result = applyEdits(
      proposal([{ path: TRAVERSAL, explanation: 'x', oldString: 'const a = 1;', newString: 'pwned' }]),
      candidates([TRAVERSAL, ORIGINAL]),
    );
    assertEqual(result.applied.length, 0, 'traversal never applied');
    assertEqual(result.folded.size, 0, 'nothing folded for the traversal path');
  });

  t('edit-policy: candidate selection never fetches a denied or traversal path', async () => {
    const fetched: string[] = [];
    const picked = await selectCandidates(
      [TRAVERSAL, '.github/workflows/ci.yml', FILE, 'packages/core/src/a.ts'],
      async (path) => {
        fetched.push(path);
        return ORIGINAL;
      },
    );
    // Fetch order is sorted, as before the extraction: a.ts sorts before x.ts.
    assertEqual(fetched, ['packages/core/src/a.ts', FILE], 'only canonical source is fetched');
    assertEqual(picked.map((c) => c.path), ['packages/core/src/a.ts', FILE], 'candidates');
  });

  t('edit-policy: candidate selection skips missing and oversized files', async () => {
    const picked = await selectCandidates([FILE, 'packages/core/src/big.ts'], async (path) =>
      path === FILE ? null : 'x'.repeat(16_001),
    );
    assertEqual(picked.length, 0, 'missing and oversized files are not candidates');
  });

  t('edit-policy: the pre-commit assertion throws on any non-canonical path', () => {
    assertThrows(() => assertPatchablePaths([FILE, TRAVERSAL]), 'refusing');
    assertThrows(() => assertPatchablePaths(['packages/core/src/a\\b.ts']), 'refusing');
  });

  t('edit-policy: the pre-commit assertion passes canonical source paths', () => {
    assertPatchablePaths([FILE, 'packages/cli/src/deep/y.ts']);
  });
}
