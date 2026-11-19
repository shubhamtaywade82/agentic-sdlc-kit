// packages/cli/src/commands/new.ts
//
// `kit new <name> [--stack <stack>] [--dir <path>] [--json]`.
// Scaffolds a new greenfield application repository (M8).

import path from 'node:path';
import { scaffoldGreenfieldApp, type GreenfieldAppResult } from '@agentic-sdlc-kit/core';
import type { Command, CommandContext, CommandResult } from './types.js';

export const newCommand: Command = {
  name: 'new',
  summary:
    'Scaffold a new application with baseline architecture ADR, profile, and initial spec (M8).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
      ctx.stdout(formatHelp());
      return { exitCode: 0 };
    }

    const name = ctx.argv.find((a) => !a.startsWith('-'));
    if (!name) {
      ctx.stderr('kit new: error: missing required application name\n');
      return { exitCode: 1, message: 'Missing application name' };
    }

    const isJson = ctx.argv.includes('--json');
    const stackIdx = ctx.argv.indexOf('--stack');
    const stack = stackIdx !== -1 ? ctx.argv[stackIdx + 1] : 'node-typescript';
    const dirIdx = ctx.argv.indexOf('--dir');
    const targetDir =
      dirIdx !== -1 && ctx.argv[dirIdx + 1]
        ? path.resolve(ctx.cwd, ctx.argv[dirIdx + 1]!)
        : ctx.cwd;

    const res = await scaffoldGreenfieldApp({ name, targetDir, stack });
    if (!res.ok) {
      ctx.stderr(`kit new: error: ${res.error.message}\n`);
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

function formatSummary(result: GreenfieldAppResult): string {
  const lines: string[] = [
    `Application:   ${result.name}`,
    `Location:      ${result.appDir}`,
    `Profile:       ${result.profilePath}`,
    `Baseline ADR:  ${result.adrPath}`,
    `Initial Spec:  ${result.specPath}`,
    '',
    `Successfully created greenfield application '${result.name}'.`,
  ];
  return lines.join('\n') + '\n';
}

function formatHelp(): string {
  return [
    'Usage: kit new <name> [--stack <stack>] [--dir <path>] [--json]',
    '',
    'Scaffold a new greenfield application repository with baseline architecture ADRs,',
    'project profile (.ai-kit/project.yml), and initial feature specification.',
    '',
    'Options:',
    '  --stack <stack>   Target stack (default: node-typescript)',
    '  --dir <path>      Destination directory (default: current working directory)',
    '  --json            Output machine-readable creation result',
    '  --help            Show this message',
    '',
  ].join('\n');
}
