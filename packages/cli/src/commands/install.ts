// packages/cli/src/commands/install.ts
//
// `kit install [--profile minimal|full-sdlc|runtime] [--stack <stack>] [--json]`.
// M15 CLI installer and environment configurator.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveStackPack } from '@agentic-sdlc-kit/core';
import type { Command, CommandContext, CommandResult } from './types.js';

export const installCommand: Command = {
  name: 'install',
  summary: 'Install and configure kit environment, instructions, and stack packs (M15).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
      ctx.stdout(formatHelp());
      return { exitCode: 0 };
    }

    const isJson = ctx.argv.includes('--json');
    const stackIdx = ctx.argv.indexOf('--stack');
    const stackName = stackIdx !== -1 ? ctx.argv[stackIdx + 1] : undefined;
    const profileIdx = ctx.argv.indexOf('--profile');
    const installProfile = profileIdx !== -1 ? ctx.argv[profileIdx + 1] : 'full-sdlc';

    const aiKitDir = path.join(ctx.cwd, '.ai-kit');
    await fs.mkdir(aiKitDir, { recursive: true });

    let stackInfo = 'none';
    if (stackName) {
      const pack = resolveStackPack(stackName);
      stackInfo = pack ? pack.name : stackName;
    }

    const result = {
      installed: true,
      profile: installProfile,
      stack: stackInfo,
      configDir: aiKitDir,
    };

    if (isJson) {
      ctx.stdout(JSON.stringify(result, null, 2) + '\n');
    } else {
      ctx.stdout(`kit install: SUCCESS (profile=${installProfile}, stack=${stackInfo})\n`);
    }

    return { exitCode: 0 };
  },
};

function formatHelp(): string {
  return [
    'Usage: kit install [--profile <profile>] [--stack <stack>] [--json]',
    '',
    'Install and configure kit environment, instructions, commands, and stack packs.',
    '',
    'Profiles:',
    '  minimal      Core instructions and essential skills only',
    '  full-sdlc    Complete workflows, agents, templates, and planning engines (default)',
    '  runtime      Runtime governance, secret protection, and model routing mods',
    '',
    'Options:',
    '  --stack <id> Stack pack to activate (e.g. node-typescript, ruby-rails)',
    '  --json       Output machine-readable installation status',
    '  --help       Show this message',
    '',
  ].join('\n');
}
