// packages/cli/src/commands/fix.ts
//
// `kit fix <issue-id> [action] [task-id] [options]`.
//
// A defect is driven through the SAME evidence-gated engine as a feature
// (`kit feature`): the regression test must fail as an ASSERTION (Red) before
// the correction is accepted (Green), then the suite must stay green
// (Refactor), with a hash-chained journal and `kit next` guidance.
//
// This command used to run the whole-profile verification and report a
// "confirmed" regression without ever observing a failing test. It no longer
// carries any workflow of its own: it only delegates, so it cannot assert more
// than the engine has measured.

import { featureCommand } from './feature.js';
import type { Command, CommandContext, CommandResult } from './types.js';

export function createFixCommand(engine: Command = featureCommand): Command {
  return {
    name: 'fix',
    summary:
      'Fix a defect through the evidence-gated engine: failing regression test first (Red/Green/Refactor).',
    async run(ctx: CommandContext): Promise<CommandResult> {
      if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
        ctx.stdout(formatHelp());
        return { exitCode: 0 };
      }
      const issueId = ctx.argv.find((a) => !a.startsWith('-'));
      if (!issueId) {
        ctx.stderr('kit fix: error: missing required issue identifier (e.g. BUG-001)\n');
        return { exitCode: 1, message: 'Missing issue ID' };
      }
      return engine.run(ctx);
    },
  };
}

export const fixCommand: Command = createFixCommand();

function formatHelp(): string {
  return [
    'Usage: kit fix <issue-id> [start|red|green|refactor|status|verify|run] [task-id] [options]',
    '',
    'Drive a bug fix through the same evidence gates as a feature. The issue id is the',
    'run id (e.g. BUG-101): author docs/specifications/features/<id>/SPEC.md (expected vs',
    'actual behavior) and docs/plans/<id>/plan.json, then:',
    '',
    '  kit fix BUG-101 start            begin the run (no action: start, or status if it exists)',
    '  kit fix BUG-101 red TASK-001     the regression test must FAIL as an assertion',
    '  kit fix BUG-101 green TASK-001   the smallest correction must pass it',
    '  kit fix BUG-101 refactor TASK-001  the suite must stay green',
    '  kit fix BUG-101 verify           audit every chain + whole-profile regression',
    '',
    'Options are those of `kit feature` (--json, --host <id>, --dry-run, ...).',
    'Do not combine a behavior fix with a refactor in one run.',
    '',
  ].join('\n');
}
