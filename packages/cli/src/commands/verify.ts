// packages/cli/src/commands/verify.ts
//
// `kit verify [path] [--dry-run] [--json]`.
// Deterministic verification runner executing configured test, lint, and typecheck commands.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseProfileYaml, ProcessVerificationRunner } from '@agentic-sdlc-kit/core';
import type { VerificationReport } from '@agentic-sdlc-kit/contracts';
import type { Command, CommandContext, CommandResult } from './types.js';

export const verifyCommand: Command = {
  name: 'verify',
  summary: 'Execute deterministic verification commands (tests, lint, typecheck, build).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
      ctx.stdout(formatHelp());
      return { exitCode: 0 };
    }

    const isJson = ctx.argv.includes('--json');
    const isDryRun = ctx.argv.includes('--dry-run');
    const targetArg = ctx.argv.find((a) => !a.startsWith('-'));
    const targetRoot = path.resolve(ctx.cwd, targetArg ?? '.');
    const profilePath = path.join(targetRoot, '.ai-kit', 'project.yml');

    let yamlContent: string;
    try {
      yamlContent = await fs.readFile(profilePath, 'utf8');
    } catch {
      const msg = `Profile not found at ${profilePath}. Run 'kit init' first.`;
      ctx.stderr(`kit verify: ${msg}\n`);
      return { exitCode: 1, message: msg };
    }

    const profileRes = parseProfileYaml(yamlContent);
    if (!profileRes.ok) {
      ctx.stderr(`kit verify: ${profileRes.error.message}\n`);
      return { exitCode: 1, message: profileRes.error.message };
    }

    const runner = new ProcessVerificationRunner();
    const repRes = await runner.run(profileRes.value, { cwd: targetRoot, dryRun: isDryRun });
    if (!repRes.ok) {
      ctx.stderr(`kit verify: runner error: ${repRes.error.message}\n`);
      return { exitCode: 1, message: repRes.error.message };
    }

    const report = repRes.value;
    if (isJson) {
      ctx.stdout(JSON.stringify(report, null, 2) + '\n');
    } else {
      ctx.stdout(formatReportSummary(report));
    }

    return { exitCode: report.status === 'passed' ? 0 : 1 };
  },
};

function formatReportSummary(report: VerificationReport): string {
  const lines: string[] = [
    `Verification Run: ${report.runId}`,
    `Status:           ${report.status.toUpperCase()}`,
    `Checks:`,
  ];
  for (const c of report.checks) {
    const dur = c.durationMs !== undefined ? ` (${c.durationMs}ms)` : '';
    const cmdStr = c.command ? ` [${c.command.join(' ')}]` : '';
    lines.push(`  - ${c.id.padEnd(12)} ${c.status.toUpperCase()}${dur}${cmdStr}`);
  }
  return lines.join('\n') + '\n';
}

function formatHelp(): string {
  return [
    'Usage: kit verify [path] [--dry-run] [--json]',
    '',
    'Execute deterministic verification checks configured in .ai-kit/project.yml.',
    'Commands run with shell: false and bounded timeouts.',
    '',
    'Options:',
    '  --dry-run   Mark checks as skipped without executing processes',
    '  --json      Output full machine-readable VerificationReport',
    '  --help      Show this message',
    '',
  ].join('\n');
}
