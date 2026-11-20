// packages/core/src/discovery/git-scanner.ts
//
// Read-only discovery of git repository state.
// When the root is not inside a git work tree, reports isRepo: false with
// empty branch/headSha — it never fabricates a plausible-looking default.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitState } from '@agentic-sdlc-kit/contracts';

const execFileAsync = promisify(execFile);

async function runGit(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function detectGitState(root: string): Promise<GitState> {
  // Is this even a git work tree? `git rev-parse --is-inside-work-tree`
  // prints "true" only inside one. If not, report honestly instead of
  // inventing branch=main / commit=0000000.
  const insideWorkTree = await runGit(['rev-parse', '--is-inside-work-tree'], root);
  if (insideWorkTree !== 'true') {
    return { isRepo: false, branch: '', dirty: false, headSha: '' };
  }

  const branchOutput = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], root);
  const branch = branchOutput || '';

  const shaOutput = await runGit(['rev-parse', 'HEAD'], root);
  const headSha = /^[0-9a-f]{40}$/i.test(shaOutput) ? shaOutput.toLowerCase() : '';

  const statusOutput = await runGit(['status', '--porcelain'], root);
  const dirty = statusOutput.length > 0;

  return { isRepo: true, branch, dirty, headSha };
}
