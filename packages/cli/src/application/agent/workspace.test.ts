// packages/cli/src/application/agent/workspace.test.ts
//
// Worktree workspace manager tests (ADR-0019 v2 revision B, ADR-0020 §7):
// a dedicated git worktree per run, with the branch + baseCommitSha
// identity the contract requires, and honest failure modes.

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  createWorktreeWorkspace,
  removeWorktreeWorkspace,
  worktreeBranch,
  worktreeDir,
  workspaceExists,
} from './workspace.js';

const exec = promisify(execFile);

async function gitRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-workspace-'));
  await exec('git', ['init', '-b', 'main'], { cwd: root });
  await fs.writeFile(path.join(root, 'file.txt'), 'baseline\n');
  await exec(
    'git',
    ['-c', 'user.email=k@e.com', '-c', 'user.name=k', 'add', '.'],
    { cwd: root },
  );
  await exec(
    'git',
    ['-c', 'user.email=k@e.com', '-c', 'user.name=k', 'commit', '-m', 'init'],
    { cwd: root },
  );
  return root;
}

describe('createWorktreeWorkspace', () => {
  it('creates an isolated git worktree with full identity (kind/branch/baseCommitSha)', async () => {
    const root = await gitRepo();
    const res = await createWorktreeWorkspace(root, 'RUN-001');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.kind).toBe('git-worktree');
    expect(res.value.branch).toBe('kit/RUN-001');
    expect(res.value.rootPath).toBe(worktreeDir(root, 'RUN-001'));
    expect(res.value.baseCommitSha).toMatch(/^[0-9a-f]{7,40}$/);
    // A real worktree: .git is a FILE pointing at the main repo metadata.
    const stat = await fs.stat(path.join(res.value.rootPath, '.git'));
    expect(stat.isFile()).toBe(true);
    // The committed baseline is present in the worktree.
    expect(await fs.readFile(path.join(res.value.rootPath, 'file.txt'), 'utf8')).toBe('baseline\n');
  });

  it('refuses to overwrite an existing workspace directory', async () => {
    const root = await gitRepo();
    const first = await createWorktreeWorkspace(root, 'RUN-001');
    expect(first.ok).toBe(true);
    const second = await createWorktreeWorkspace(root, 'RUN-001');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.message).toContain('already exists');
  });

  it('fails honestly in a directory that is not a git repository', async () => {
    const notGit = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-notgit-'));
    const res = await createWorktreeWorkspace(notGit, 'RUN-001');
    expect(res.ok).toBe(false);
  });
});

describe('workspaceExists / removeWorktreeWorkspace', () => {
  it('probes existence and removes worktree plus branch', async () => {
    const root = await gitRepo();
    const res = await createWorktreeWorkspace(root, 'RUN-001');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await workspaceExists(res.value)).toBe(true);

    const rm = await removeWorktreeWorkspace(root, res.value);
    expect(rm.ok).toBe(true);
    expect(await workspaceExists(res.value)).toBe(false);
    // The branch is gone too.
    const branches = await exec('git', ['branch', '--list', worktreeBranch('RUN-001')], {
      cwd: root,
    });
    expect(branches.stdout.trim()).toBe('');
  });

  it('treats a missing workspace as absent (not an error)', async () => {
    const root = await gitRepo();
    expect(
      await workspaceExists({
        id: 'ws-gone',
        kind: 'git-worktree',
        rootPath: path.join(root, '.ai-kit', 'worktrees', 'RUN-404'),
        branch: 'kit/RUN-404',
        baseCommitSha: '0000000',
        createdAt: new Date().toISOString(),
      }),
    ).toBe(false);
  });
});
