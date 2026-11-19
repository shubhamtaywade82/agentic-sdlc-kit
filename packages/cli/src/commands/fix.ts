// packages/cli/src/commands/fix.ts
//
// `kit fix <issue-id> [--dry-run] [--json]`.
// Executes the disciplined bug-fix and refactoring workflow (M9).

import path from 'node:path';
import { runBugfixWorkflow, type BugfixReport } from '@agentic-sdlc-kit/core';
import type { Command, CommandContext, CommandResult } from './types.js';

export const fixCommand: Command = {
  name: 'fix',
  summary:
    'Execute disciplined bug-fix workflow with reproduction and regression verification (M9).',
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

    const isJson = ctx.argv.includes('--json');
    const isDryRun = ctx.argv.includes('--dry-run');
    const targetRoot = path.resolve(ctx.cwd, '.');

    const res = await runBugfixWorkflow({ issueId, projectRoot: targetRoot, dryRun: isDryRun });
    if (!res.ok) {
      ctx.stderr(`kit fix: workflow error: ${res.error.message}\n`);
      return { exitCode: 1, message: res.error.message };
    }

    if (isJson) {
      ctx.stdout(JSON.stringify(res.value, null, 2) + '\n');
    } else {
      ctx.stdout(formatSummary(res.value));
    }
    return { exitCode: res.value.status === 'passed' ? 0 : 1 };
  },
};

function formatSummary(report: BugfixReport): string {
  const lines: string[] = [
    `Bugfix Run:        ${report.issueId}`,
    `Status:            ${report.status.toUpperCase()}`,
    `Regression Cover:  ${report.regressionCovered ? 'CONFIRMED' : 'MISSING'}`,
    `Verification:      ${report.verification.status.toUpperCase()}`,
    `Duration:          ${report.durationMs}ms`,
  ];
  return lines.join('\n') + '\n';
}

function formatHelp(): string {
  return [
    'Usage: kit fix <issue-id> [--dry-run] [--json]',
    '',
    'Execute a bug-fix workflow: reproduce via failing test (red), implement fix (green),',
    'and run full regression verification.',
    '',
    'Options:',
    '  --dry-run   Simulate execution without running active subprocesses',
    '  --json      Output machine-readable BugfixReport',
    '  --help      Show this message',
    '',
  ].join('\n');
}
