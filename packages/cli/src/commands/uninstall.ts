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
import { linkTarget } from './plugin-linker.js';
import type { Command, CommandContext, CommandResult } from './types.js';

const MANIFEST_PATH = '.ai-kit/ownership-manifest.json';

type Verdict = 'remove' | 'keep-modified' | 'keep-foreign' | 'missing';

const sha256 = (text: string): string => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

/** True only when `full` stays inside `root` (a manifest must never reach outside it). */
function isInside(root: string, full: string): boolean {
  const rel = path.relative(root, full);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * A recorded link is the kit's only while it still points where the kit
 * pointed it. Entries from before `target` existed are verified by content:
 * the plugin identity file read through the link must hash to the recorded value.
 */
async function ownsLink(full: string, entry: OwnershipEntry): Promise<boolean> {
  if (entry.target !== undefined) return (await linkTarget(full)) === entry.target;
  const identity = await fs
    .readFile(path.join(full, '.claude-plugin', 'plugin.json'), 'utf8')
    .catch(() => undefined);
  return identity !== undefined && sha256(identity) === entry.sha256;
}

async function judge(root: string, entry: OwnershipEntry): Promise<Verdict> {
  const full = path.resolve(root, entry.path);
  if (!isInside(root, full)) return 'keep-foreign';
  const stat = await fs.lstat(full).catch(() => null);
  if (!stat) return 'missing';
  if (stat.isSymbolicLink()) return (await ownsLink(full, entry)) ? 'remove' : 'keep-foreign';
  if (!stat.isFile()) return 'keep-foreign'; // a real directory is never ours to delete
  const content = await fs.readFile(full, 'utf8');
  return sha256(content) === entry.sha256 ? 'remove' : 'keep-modified';
}

/** One bad entry must not abort the run half-way: anything unjudgeable is kept. */
async function safeJudge(root: string, entry: OwnershipEntry): Promise<Verdict> {
  try {
    return await judge(root, entry);
  } catch {
    return 'keep-foreign';
  }
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
    const foreign: string[] = [];
    for (const entry of entries) {
      const verdict = await safeJudge(root, entry);
      if (verdict === 'keep-modified') kept.push(entry.path);
      if (verdict === 'keep-foreign') foreign.push(entry.path);
      if (verdict !== 'remove') continue;
      if (!dryRun) await fs.rm(path.resolve(root, entry.path), { force: true });
      removed.push(entry.path);
    }
    if (!dryRun) await fs.rm(path.join(root, MANIFEST_PATH), { force: true });

    const label = dryRun ? 'would remove' : 'removed';
    ctx.stdout(
      [
        `kit uninstall${dryRun ? ' --dry-run' : ''}`,
        ...removed.map((p) => `  ${label}  ${p}`),
        ...kept.map((p) => `  kept (edited since install)  ${p}`),
        ...foreign.map((p) => `  kept (not a file or link the kit created)  ${p}`),
        '',
      ].join('\n'),
    );
    return { exitCode: 0 };
  },
};
