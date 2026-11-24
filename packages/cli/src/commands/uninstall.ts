// packages/cli/src/commands/uninstall.ts
//
// `kit uninstall [--dir <path>] [--dry-run] [--json]`. Removes only what
// `kit install` recorded in the ownership manifest: files whose content is
// unchanged since install, and plugin symlinks (the link, never its target).
// Files the user edited or that were never ours are kept and reported.

import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { OwnershipManifestSchema, type OwnershipEntry } from '@agentic-sdlc-kit/contracts';
import type { Command, CommandContext, CommandResult } from './types.js';

const MANIFEST_PATH = '.ai-kit/ownership-manifest.json';

type Verdict = 'remove' | 'keep-modified' | 'missing';

async function judge(root: string, entry: OwnershipEntry): Promise<Verdict> {
  const full = path.join(root, entry.path);
  const stat = await fs.lstat(full).catch(() => null);
  if (!stat) return 'missing';
  if (stat.isSymbolicLink()) return 'remove';
  const content = await fs.readFile(full, 'utf8');
  const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  return hash === entry.sha256 ? 'remove' : 'keep-modified';
}

async function readManifest(root: string): Promise<OwnershipEntry[] | undefined> {
  const raw = await fs.readFile(path.join(root, MANIFEST_PATH), 'utf8').catch(() => undefined);
  if (raw === undefined) return undefined;
  return OwnershipManifestSchema.parse(JSON.parse(raw)).entries;
}

export const uninstallCommand: Command = {
  name: 'uninstall',
  summary: 'Remove files and plugin links that kit install created and you have not edited.',
  async run(ctx: CommandContext): Promise<CommandResult> {
    const dryRun = ctx.argv.includes('--dry-run');
    const dirIdx = ctx.argv.indexOf('--dir');
    const dirArg = dirIdx !== -1 ? ctx.argv[dirIdx + 1] : undefined;
    if (dirIdx !== -1 && (!dirArg || dirArg.startsWith('-'))) {
      ctx.stderr('kit uninstall: --dir requires a directory path\n');
      return { exitCode: 1, message: 'missing --dir value' };
    }
    const root = path.resolve(ctx.cwd, dirArg ?? '.');

    let entries: OwnershipEntry[] | undefined;
    try {
      entries = await readManifest(root);
    } catch (err) {
      ctx.stderr(`kit uninstall: unreadable ownership manifest in ${root}: ${String(err)}\n`);
      return { exitCode: 1, message: 'invalid ownership manifest' };
    }
    if (!entries) {
      ctx.stderr(`kit uninstall: no ${MANIFEST_PATH} in ${root}; nothing owned to remove\n`);
      return { exitCode: 1, message: 'no ownership manifest' };
    }

    const removed: string[] = [];
    const kept: string[] = [];
    for (const entry of entries) {
      const verdict = await judge(root, entry);
      if (verdict === 'keep-modified') kept.push(entry.path);
      if (verdict !== 'remove') continue;
      if (!dryRun) await fs.rm(path.join(root, entry.path), { force: true });
      removed.push(entry.path);
    }
    if (!dryRun) await fs.rm(path.join(root, MANIFEST_PATH), { force: true });

    const label = dryRun ? 'would remove' : 'removed';
    ctx.stdout(
      [
        `kit uninstall${dryRun ? ' --dry-run' : ''}`,
        ...removed.map((p) => `  ${label}  ${p}`),
        ...kept.map((p) => `  kept (edited since install)  ${p}`),
        '',
      ].join('\n'),
    );
    return { exitCode: 0 };
  },
};
