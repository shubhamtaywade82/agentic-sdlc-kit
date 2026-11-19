// packages/cli/src/commands/inspect.ts
//
// `kit inspect [path] [--json]`.
// Read-only inspection of target repository stacks, conventions, and git state.

import path from 'node:path';
import { FileSystemRepositoryScanner } from '@agentic-sdlc-kit/core';
import type { RepositoryScan } from '@agentic-sdlc-kit/contracts';
import type { Command, CommandContext, CommandResult } from './types.js';

export const inspectCommand: Command = {
  name: 'inspect',
  summary:
    'Inspect a repository and report detected stacks, frameworks, and conventions (read-only).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
      ctx.stdout(formatHelp());
      return { exitCode: 0 };
    }

    const isJson = ctx.argv.includes('--json');
    const targetArg = ctx.argv.find((a) => !a.startsWith('-'));
    const targetRoot = path.resolve(ctx.cwd, targetArg ?? '.');

    const scanner = new FileSystemRepositoryScanner();
    const res = await scanner.scan(targetRoot);
    if (!res.ok) {
      ctx.stderr(`kit inspect: error: ${res.error.message}\n`);
      return { exitCode: 1, message: res.error.message };
    }

    if (isJson) {
      ctx.stdout(JSON.stringify(res.value, null, 2) + '\n');
    } else {
      ctx.stdout(formatSummary(res.value));
    }

    return { exitCode: 0 };
  },
};

function formatSummary(scan: RepositoryScan): string {
  const lines: string[] = [
    `Repository:    ${scan.root}`,
    `Stacks:        ${scan.detectedStacks.join(', ') || '(none)'}`,
    `Package Mgr:   ${scan.packageManagers.join(', ') || '(none)'}`,
    `Test Tooling:  ${scan.testFrameworks.join(', ') || '(none)'}`,
    `Entry Points:  ${scan.entryPoints.join(', ') || '(none)'}`,
    `Migrations:    ${scan.hasMigrations ? 'yes' : 'no'}`,
    `CI Pipeline:   ${scan.hasCi ? 'yes' : 'no'}`,
    `Instructions:  ${scan.agentInstructionFiles.join(', ') || '(none)'}`,
    `Git Status:    branch=${scan.git.branch}, dirty=${scan.git.dirty}, commit=${scan.git.headSha.slice(0, 7)}`,
  ];
  return lines.join('\n') + '\n';
}

function formatHelp(): string {
  return [
    'Usage: kit inspect [path] [--json]',
    '',
    'Inspect a repository and report detected stacks, frameworks, and conventions.',
    'This command is strictly read-only and never modifies repository files.',
    '',
    'Options:',
    '  --json       Output full inspection report as JSON',
    '  -h, --help   Show this help message',
    '',
  ].join('\n');
}
