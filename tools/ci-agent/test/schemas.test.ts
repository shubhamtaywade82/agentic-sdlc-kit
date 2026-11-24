// tools/ci-agent/test/schemas.test.ts
//
// Offline tests for the zod contracts (invariant 3: malformed model output
// must never pass validation).

import { assertEqual, assertThrows, type Registrar } from './harness.js';
import { FixProposal, ReviewResult, SEVERITIES } from '../src/schemas.js';

export function register(t: Registrar): void {
  t('schemas: ReviewResult accepts a valid payload', () => {
    const parsed = ReviewResult.parse({
      summary: 'Solid change with two concerns.',
      findings: [
        {
          severity: 'high',
          file: 'packages/cli/src/commands/skills.ts',
          line: 42,
          title: 'Unchecked mkdir',
          detail: 'mkdir can throw on an existing symlink.',
          suggestion: 'Check with lstat first.',
        },
      ],
    });
    assertEqual(parsed.findings.length, 1, 'one finding kept');
  });

  t('schemas: ReviewResult accepts an empty findings array', () => {
    const parsed = ReviewResult.parse({ summary: 'No issues found.', findings: [] });
    assertEqual(parsed.findings.length, 0, 'no findings');
  });

  t('schemas: ReviewResult rejects an unknown severity', () => {
    assertThrows(() => ReviewResult.parse({ summary: 's', findings: [{ severity: 'blocker', file: 'f', title: 't', detail: 'd' }] }), 'Invalid option');
  });

  t('schemas: ReviewResult rejects more than 30 findings', () => {
    const findings = Array.from({ length: 31 }, (_, i) => ({
      severity: SEVERITIES[i % SEVERITIES.length],
      file: 'packages/x/src/y.ts',
      title: `f${i}`,
      detail: 'd',
    }));
    assertThrows(() => ReviewResult.parse({ summary: 's', findings }), '');
  });

  t('schemas: FixProposal accepts a valid proposal with zero edits', () => {
    const parsed = FixProposal.parse({ title: 'fix(cli): guard mkdir', body: 'Explains the repair.', edits: [] });
    assertEqual(parsed.edits.length, 0, 'empty edit set allowed (fail-safe "never guess")');
  });

  t('schemas: FixProposal rejects an empty oldString (implicit file creation)', () => {
    assertThrows(
      () =>
        FixProposal.parse({
          title: 'fix(cli): guard mkdir',
          body: 'b',
          edits: [{ path: 'packages/cli/src/x.ts', explanation: 'e', oldString: '', newString: 'new' }],
        }),
      '',
    );
  });

  t('schemas: FixProposal rejects a too-short title', () => {
    assertThrows(() => FixProposal.parse({ title: 'no', body: 'b', edits: [] }), '');
  });
}
