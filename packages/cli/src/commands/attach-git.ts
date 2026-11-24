// packages/cli/src/commands/attach-git.ts
//
// Thin git helpers for `kit attach`. All calls use argument arrays (never a
// shell string) so paths with spaces or metacharacters cannot be injected.

import { execFileSync } from 'node:child_process';
import path from 'node:path';

export interface RepoInfo {
  /** Working-tree root of the repository (or linked worktree). */
  root: string;
  /** Shared git dir: where `info/exclude` must live so linked worktrees agree. */
  commonDir: string;
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function resolveRepo(cwd: string): RepoInfo | null {
  try {
    const root = git(cwd, ['rev-parse', '--show-toplevel']).trim();
    const common = git(root, ['rev-parse', '--git-common-dir']).trim();
    return { root, commonDir: path.resolve(root, common) };
  } catch {
    return null;
  }
}

export function hasTrackedFiles(root: string, rel: string): boolean {
  return git(root, ['ls-files', '--', rel]).trim().length > 0;
}

export function isIgnored(root: string, rel: string): boolean {
  try {
    git(root, ['check-ignore', '-q', '--', rel]);
    return true;
  } catch {
    return false; // exit 1 = not ignored
  }
}

export function statusLeaks(root: string, rels: readonly string[]): string[] {
  const out = git(root, ['status', '--porcelain', '--', ...rels]);
  return out.split('\n').filter((l) => l.length > 0);
}
