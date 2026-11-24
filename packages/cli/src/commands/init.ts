// packages/cli/src/commands/init.ts
//
// `kit init [path] [--force] [--json]`.
// Initializes the Agentic SDLC Kit configuration (.ai-kit/project.yml).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  FileSystemRepositoryScanner,
  generateProfile,
  kitStateRoot,
  writeProfile,
} from '@agentic-sdlc-kit/core';
import type { ProjectProfile } from '@agentic-sdlc-kit/contracts';
import type { Command, CommandContext, CommandResult } from './types.js';

export const initCommand: Command = {
  name: 'init',
  summary: 'Initialize the Agentic SDLC Kit profile (.ai-kit/project.yml) for a repository.',
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
      ctx.stdout(formatHelp());
      return { exitCode: 0 };
    }

    const isJson = ctx.argv.includes('--json');
    const isForce = ctx.argv.includes('--force') || ctx.argv.includes('-f');
    const targetArg = ctx.argv.find((a) => !a.startsWith('-'));
    const targetRoot = path.resolve(ctx.cwd, targetArg ?? '.');

    const configPath = path.join(targetRoot, '.ai-kit', 'project.yml');
    if (!isForce && (await fileExists(configPath))) {
      ctx.stderr('kit init: .ai-kit/project.yml already exists (use --force to overwrite)\n');
      return { exitCode: 1, message: 'project profile already exists' };
    }

    const scanner = new FileSystemRepositoryScanner();
    const scanRes = await scanner.scan(targetRoot);
    if (!scanRes.ok) {
      ctx.stderr(`kit init: discovery failed: ${scanRes.error.message}\n`);
      return { exitCode: 1, message: scanRes.error.message };
    }

    const profileRes = generateProfile(scanRes.value);
    if (!profileRes.ok) {
      ctx.stderr(`kit init: profile generation failed: ${profileRes.error.message}\n`);
      return { exitCode: 1, message: profileRes.error.message };
    }

    const profile = profileRes.value;
    const writeRes = await writeProfile(targetRoot, profile);
    if (!writeRes.ok) {
      ctx.stderr(`kit init: write failed: ${writeRes.error.message}\n`);
      return { exitCode: 1, message: writeRes.error.message };
    }

    await ensureDirectories(targetRoot);

    if (isJson) {
      ctx.stdout(JSON.stringify(profile, null, 2) + '\n');
    } else {
      ctx.stdout(formatOutput(targetRoot, profile));
    }

    return { exitCode: 0 };
  },
};

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function ensureDirectories(root: string): Promise<void> {
  // Machinery dirs follow KIT_STATE_DIR; project.yml itself stays project-rooted.
  const stateRoot = kitStateRoot(root);
  await fs.mkdir(path.join(stateRoot, 'state'), { recursive: true });
  await fs.mkdir(path.join(stateRoot, 'reports'), { recursive: true });
}

function formatOutput(root: string, profile: ProjectProfile): string {
  const lines: string[] = [
    `Initialized Agentic SDLC Kit profile for '${profile.name}':`,
    `  Stack:    ${profile.stack.join(', ')}`,
    `  Commands: ${Object.keys(profile.commands).join(', ') || '(none)'}`,
    `  Config:   ${path.join(root, '.ai-kit', 'project.yml')}`,
    '',
    "Next: Run 'kit inspect' to verify repository information.",
    '',
  ];
  return lines.join('\n');
}

function formatHelp(): string {
  return [
    'Usage: kit init [path] [--force] [--json]',
    '',
    'Inspect a repository and generate .ai-kit/project.yml configuration.',
    '',
    'Options:',
    '  --force, -f  Overwrite existing .ai-kit/project.yml',
    '  --json       Output generated profile as JSON',
    '  -h, --help   Show this help message',
    '',
  ].join('\n');
}
