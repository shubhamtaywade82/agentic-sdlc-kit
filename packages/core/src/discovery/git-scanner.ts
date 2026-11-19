// packages/core/src/discovery/git-scanner.ts
//
// Read-only discovery of git repository state.
// Falls back to safe defaults when git is unavailable or root is not a git repo.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitState } from '@agentic-sdlc-kit/contracts';

const execFileAsync = promisify(execFile);
const FALLBACK_SHA = '0000000000000000000000000000000000000000';

async function runGit(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function detectGitState(root: string): Promise<GitState> {
  const branchOutput = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], root);
  const branch = branchOutput || 'main';

  const shaOutput = await runGit(['rev-parse', 'HEAD'], root);
  const headSha = /^[0-9a-f]{40}$/i.test(shaOutput) ? shaOutput.toLowerCase() : FALLBACK_SHA;

  const statusOutput = await runGit(['status', '--porcelain'], root);
  const dirty = statusOutput.length > 0;

  return { branch, dirty, headSha };
}
