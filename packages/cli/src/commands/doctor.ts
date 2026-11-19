// packages/cli/src/commands/doctor.ts
//
// `kit doctor`. Checks the kit's toolchain and configuration health:
//   - Node version meets the minimum.
//   - pnpm is available.
//   - git is available.
//   - Project profile (.ai-kit/project.yml) status.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { VERSION } from '../application/version.js';
import type { Command, CommandContext, CommandResult } from './types.js';

const MIN_NODE_MAJOR = 20;

export const doctorCommand: Command = {
  name: 'doctor',
  summary: 'Check the kit toolchain and configuration health.',
  async run(ctx: CommandContext): Promise<CommandResult> {
    const lines: string[] = [];
    let healthy = true;

    lines.push(`kit ${VERSION}`);
    lines.push('');

    const nodeVersion = process.versions.node;
    const nodeMajor = Number.parseInt(nodeVersion.split('.')[0] ?? '0', 10);
    const nodeOk = nodeMajor >= MIN_NODE_MAJOR;
    if (!nodeOk) healthy = false;
    lines.push(
      `  node           ${nodeVersion}  ${nodeOk ? '[ok]' : `[FAIL: needs >= ${MIN_NODE_MAJOR}]`}`,
    );

    const pnpmPath = await findExecutable('pnpm');
    const pnpmOk = pnpmPath !== null;
    if (!pnpmOk) healthy = false;
    lines.push(`  pnpm           ${pnpmOk ? 'found' : 'MISSING'}  ${pnpmOk ? '[ok]' : '[FAIL]'}`);

    const gitPath = await findExecutable('git');
    const gitOk = gitPath !== null;
    if (!gitOk) healthy = false;
    lines.push(`  git            ${gitOk ? 'found' : 'MISSING'}  ${gitOk ? '[ok]' : '[FAIL]'}`);

    // Workspace packages — declared, not built
    lines.push(
      `  workspace      contracts, core, cli, testing, claude-code-adapter, mod-sdk  [declared]`,
    );

    const profile = await checkProfile(ctx.cwd);
    lines.push(`  profile        ${profile.msg}  [${profile.status}]`);

    lines.push('');
    lines.push(healthy ? 'Status: healthy' : 'Status: issues found');
    ctx.stdout(lines.join('\n') + '\n');
    return { exitCode: healthy ? 0 : 2 };
  },
};

async function findExecutable(name: string): Promise<string | null> {
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync(name, ['--version'], { stdio: 'ignore' });
    return name;
  } catch {
    return null;
  }
}

async function checkProfile(cwd: string): Promise<{ msg: string; status: 'ok' | 'info' }> {
  const configPath = path.join(cwd, '.ai-kit', 'project.yml');
  try {
    const stat = await fs.stat(configPath);
    if (stat.isFile()) return { msg: '.ai-kit/project.yml present', status: 'ok' };
  } catch {
    // profile does not exist yet
  }
  return { msg: "no profile (run 'kit init')", status: 'info' };
}
