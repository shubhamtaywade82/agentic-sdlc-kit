// packages/cli/src/application/agent/workspace.ts
//
// Execution workspace manager (ADR-0019 v2 revision B, ADR-0020 §7).
//
// Every Mode 1 run executes in a DEDICATED GIT WORKTREE per workflow run,
// never in the developer's active working tree. This isolates repository
// changes and gives the orchestrator a clean diff for evidence (branch +
// baseCommitSha are recorded in the ExecutionWorkspace, which is exactly
// what the git-worktree schema variant requires).
//
// SECURITY QUALIFICATION (ADR-0020 §7, honest scope): a git worktree
// isolates REPOSITORY changes; it is NOT an OS sandbox. Provider
// processes must additionally run with restricted host permissions or in
// a container (PR4's concern). Nothing here claims otherwise.
//
// All git invocations are argument arrays via execFile — never a shell
// string, never shell:true (the kit's non-negotiable process rule).

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Errors, type ExecutionWorkspace, type Result } from '@agentic-sdlc-kit/contracts';

const GIT_TIMEOUT_MS = 30_000;

function execGit(args: readonly string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [...args],
      { cwd, timeout: GIT_TIMEOUT_MS, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`git ${args.join(' ')} failed: ${String(stderr || err.message)}`));
        } else {
          resolve({ stdout: String(stdout), stderr: String(stderr) });
        }
      },
    );
  });
}

export function worktreeDir(projectRoot: string, runId: string): string {
  return path.resolve(projectRoot, '.ai-kit', 'worktrees', runId);
}

export function worktreeBranch(runId: string): string {
  return `kit/${runId}`;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create the isolated execution workspace for a run: a git worktree at
 * .ai-kit/worktrees/<runId> on branch kit/<runId>, based at the current
 * HEAD of the project. The workspace identity (branch + baseCommitSha) is
 * frozen in the returned ExecutionWorkspace and persisted by the
 * orchestrator, so later phases and audits can derive clean diffs.
 */
export async function createWorktreeWorkspace(
  projectRoot: string,
  runId: string,
  now: () => Date = () => new Date(),
): Promise<Result<ExecutionWorkspace>> {
  const dir = worktreeDir(projectRoot, runId);
  try {
    if (await pathExists(dir)) {
      return {
        ok: false,
        error: Errors.contractInvalid(
          `Workspace directory ${dir} already exists — the orchestration state and the ` +
            `filesystem have diverged; refusing to overwrite`,
        ),
      };
    }
    const shaRes = await execGit(['rev-parse', 'HEAD'], projectRoot);
    const baseCommitSha = shaRes.stdout.trim();
    if (!/^[0-9a-f]{7,40}$/.test(baseCommitSha)) {
      return {
        ok: false,
        error: Errors.contractInvalid(
          `Could not resolve a commit HEAD for ${projectRoot} — the project must have ` +
            `at least one commit before Mode 1 execution (spec, plan, and profile must be committed)`,
        ),
      };
    }
    await execGit(['worktree', 'add', '-b', worktreeBranch(runId), dir, baseCommitSha], projectRoot);
    return {
      ok: true,
      value: {
        id: `ws-${runId}`,
        kind: 'git-worktree',
        rootPath: dir,
        branch: worktreeBranch(runId),
        baseCommitSha,
        createdAt: now().toISOString(),
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: Errors.internal(`Failed to create execution workspace: ${String(e)}`),
    };
  }
}

/**
 * Probe that a persisted workspace still exists on disk. A git worktree
 * is marked by a `.git` FILE (not a directory) pointing at the main
 * repo's worktree metadata — that is the check.
 */
export async function workspaceExists(workspace: ExecutionWorkspace): Promise<boolean> {
  try {
    const gitLink = path.join(workspace.rootPath, '.git');
    const stat = await fs.stat(gitLink);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Remove a worktree and its branch. Used by tests and by explicit
 * cleanup; the orchestrator does NOT auto-remove on completion — the
 * worktree is the evidence (the diff) and stays for review/merge.
 */
export async function removeWorktreeWorkspace(
  projectRoot: string,
  workspace: ExecutionWorkspace,
): Promise<Result<true>> {
  try {
    await execGit(['worktree', 'remove', '--force', workspace.rootPath], projectRoot);
  } catch {
    // The worktree may already be gone; prune and continue.
    try {
      await execGit(['worktree', 'prune'], projectRoot);
    } catch {
      // fall through: branch cleanup below is best-effort too
    }
  }
  try {
    if (workspace.branch) {
      await execGit(['branch', '-D', workspace.branch], projectRoot);
    }
  } catch {
    // Branch may not exist (already merged/deleted) — not an error.
  }
  return { ok: true, value: true };
}
