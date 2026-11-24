// packages/cli/src/commands/attach.ts
//
// `kit attach <local|global|status|detach> [--adopt]`
//
// Provisions the kit's working paths (.ai-kit, .claude, docs/specifications,
// docs/plans) WITHOUT touching tracked files, and proves git-invisibility
// before reporting success (fail closed).
//   local   real directories, hidden via .git/info/exclude
//   global  symlinks into $KIT_ATTACH_HOME/<repo>-<hash>/ (default
//           ~/.agentic-sdlc/projects)
//
// Mode 1 (`kit feature <id> run`) needs committed artifacts and therefore
// cannot be used while attached; Mode 2 / `kit next` is unaffected.

import path from 'node:path';
import {
  hasTrackedFiles,
  isIgnored,
  resolveRepo,
  statusLeaks,
  type RepoInfo,
} from './attach-git.js';
import { hasBlock, removeBlock, writeBlock } from './attach-exclude.js';
import {
  AttachError,
  MANAGED_PATHS,
  attachGlobal,
  attachLocal,
  describePath,
  detachLinks,
  storeBase,
  storeDirFor,
} from './attach-store.js';
import type { Command, CommandContext, CommandResult } from './types.js';

const USAGE = [
  'Usage: kit attach <local|global|status|detach> [--adopt]',
  '  local    real dirs in the repo, hidden via .git/info/exclude',
  '  global   symlinks into $KIT_ATTACH_HOME/<repo>-<hash>/',
  '  status   show mode per path and prove git invisibility',
  '  detach   remove exclude block; remove global symlinks (store data kept)',
  '  --adopt  global only: migrate existing UNTRACKED content into the store',
].join('\n');

const excludeFile = (repo: RepoInfo): string => path.join(repo.commonDir, 'info', 'exclude');

/** Returns report lines; `leaked` is true when any managed path is visible to git. */
export function verifyInvisible(root: string): { lines: string[]; leaked: boolean } {
  const lines: string[] = [];
  let leaked = false;
  for (const rel of MANAGED_PATHS) {
    const ignored = isIgnored(root, rel);
    lines.push(`  ${ignored ? 'ignored:    ' : 'NOT IGNORED:'} ${rel}`);
    if (!ignored) leaked = true;
  }
  const leaks = statusLeaks(root, MANAGED_PATHS);
  for (const l of leaks) lines.push(`  git status LEAK: ${l}`);
  return { lines, leaked: leaked || leaks.length > 0 };
}

function assertUntracked(root: string): void {
  for (const rel of MANAGED_PATHS) {
    if (hasTrackedFiles(root, rel)) {
      throw new AttachError(
        `REFUSED: '${rel}' contains tracked files. Untrack first (git rm -r --cached '${rel}').`,
      );
    }
  }
}

function proof(root: string, header: string): CommandResult & { text: string } {
  const v = verifyInvisible(root);
  if (v.leaked) {
    const text = [...v.lines, 'verification failed: managed paths are visible to git'].join('\n');
    return { exitCode: 1, text };
  }
  return { exitCode: 0, text: [header, ...v.lines, '  git status:  clean for all managed paths.'].join('\n') };
}

async function runMode(mode: 'local' | 'global', repo: RepoInfo, adopt: boolean): Promise<string> {
  assertUntracked(repo.root);
  const store = storeDirFor(repo.root);
  if (mode === 'local') await attachLocal(repo.root);
  else await attachGlobal(repo.root, store, adopt);
  await writeBlock(excludeFile(repo), MANAGED_PATHS);
  return mode === 'local' ? `Attached (local). Exclude: ${excludeFile(repo)}` : `Attached (global). Store: ${store}`;
}

async function runStatus(repo: RepoInfo): Promise<CommandResult & { text: string }> {
  const lines = [`repo:  ${repo.root}`, `store: ${storeDirFor(repo.root)}`];
  for (const rel of MANAGED_PATHS) lines.push(`  ${await describePath(repo.root, rel)}`);
  const present = await hasBlock(excludeFile(repo));
  lines.push(`exclude block: ${present ? 'present' : 'absent'}`);
  const v = verifyInvisible(repo.root);
  lines.push(...v.lines);
  return { exitCode: v.leaked ? 1 : 0, text: lines.join('\n') };
}

async function runDetach(repo: RepoInfo): Promise<string> {
  await removeBlock(excludeFile(repo));
  const removed = await detachLinks(repo.root, storeBase(storeDirFor(repo.root)));
  const lines = removed.map((r) => `  removed symlink: ${r} (data kept in store)`);
  lines.push('Detached. Local directories (if any) left untouched.');
  return lines.join('\n');
}

async function execute(sub: string, repo: RepoInfo, adopt: boolean): Promise<CommandResult & { text: string }> {
  if (sub === 'status') return runStatus(repo);
  if (sub === 'detach') return { exitCode: 0, text: await runDetach(repo) };
  if (adopt && sub !== 'global') throw new AttachError("--adopt is only valid with 'global'");
  const header = await runMode(sub as 'local' | 'global', repo, adopt);
  return proof(repo.root, header);
}

export const attachCommand: Command = {
  name: 'attach',
  summary: 'Attach kit working paths to a repo without tracking them (local|global).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    const positional = ctx.argv.filter((a) => !a.startsWith('-'));
    const sub = positional[0];
    if (ctx.argv.includes('--help') || !sub) {
      ctx.stdout(USAGE);
      return { exitCode: sub || ctx.argv.includes('--help') ? 0 : 1 };
    }
    if (!['local', 'global', 'status', 'detach'].includes(sub)) {
      ctx.stderr(`kit attach: unknown subcommand '${sub}'\n${USAGE}`);
      return { exitCode: 1 };
    }
    const repo = resolveRepo(ctx.cwd);
    if (!repo) {
      ctx.stderr('kit attach: not inside a git repository');
      return { exitCode: 1 };
    }
    try {
      const r = await execute(sub, repo, ctx.argv.includes('--adopt'));
      (r.exitCode === 0 ? ctx.stdout : ctx.stderr)(r.text);
      return { exitCode: r.exitCode };
    } catch (e) {
      ctx.stderr(`kit attach: ${e instanceof Error ? e.message : String(e)}`);
      return { exitCode: 1 };
    }
  },
};
