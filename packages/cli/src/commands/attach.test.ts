// packages/cli/src/commands/attach.test.ts
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachCommand } from './attach.js';
import { BLOCK_BEGIN, stripBlock, withBlock } from './attach-exclude.js';
import type { CommandContext } from './types.js';

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' });

async function mkrepo(dir: string, files: Record<string, string> = { 'README.md': 'hi' }) {
  await fs.mkdir(dir, { recursive: true });
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  for (const [rel, body] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), body);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
}

const run = async (cwd: string, ...argv: string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const ctx: CommandContext = {
    argv,
    cwd,
    stdout: (s) => void out.push(s),
    stderr: (s) => void err.push(s),
  };
  const r = await attachCommand.run(ctx);
  return { ...r, out: out.join('\n'), err: err.join('\n') };
};

const clean = (dir: string): boolean => git(dir, 'status', '--porcelain').trim() === '';
const exists = (p: string) => fs.lstat(p).then(() => true, () => false);

let tmp: string;
let store: string;
beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'kit-attach-')));
  store = path.join(tmp, 'store');
  process.env['KIT_ATTACH_HOME'] = store;
});
afterEach(async () => {
  delete process.env['KIT_ATTACH_HOME'];
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('attach exclude block (pure)', () => {
  it('is idempotent and preserves foreign lines', () => {
    const once = withBlock('node_modules\n', ['a', 'b']);
    expect(withBlock(once, ['a', 'b'])).toBe(once);
    expect(stripBlock(once)).toBe('node_modules\n');
  });
});

describe('kit attach', () => {
  it('local: invisible to git, writes work, idempotent', async () => {
    const repo = path.join(tmp, 'a');
    await mkrepo(repo);
    const r = await run(repo, 'local');
    expect(r.exitCode).toBe(0);
    await fs.writeFile(path.join(repo, '.ai-kit', 'project.yml'), 'x');
    expect(clean(repo)).toBe(true);
    expect((await run(repo, 'local')).exitCode).toBe(0);
    const ex = await fs.readFile(path.join(repo, '.git', 'info', 'exclude'), 'utf8');
    expect(ex.split(BLOCK_BEGIN).length - 1).toBe(1);
  });

  it('global: symlink is ignored and bytes land in the store', async () => {
    const repo = path.join(tmp, 'b');
    await mkrepo(repo);
    expect((await run(repo, 'global')).exitCode).toBe(0);
    await fs.writeFile(path.join(repo, '.ai-kit', 'project.yml'), 'x');
    expect((await fs.lstat(path.join(repo, '.ai-kit'))).isSymbolicLink()).toBe(true);
    expect(clean(repo)).toBe(true);
    const target = await fs.readlink(path.join(repo, '.ai-kit'));
    expect(target.startsWith(store)).toBe(true);
    expect(await fs.readFile(path.join(target, 'project.yml'), 'utf8')).toBe('x');
  });

  it('refuses when a managed path has tracked files, changing nothing', async () => {
    const repo = path.join(tmp, 'c');
    await mkrepo(repo, { 'README.md': 'hi', 'docs/plans/keep.md': 'k' });
    for (const mode of ['local', 'global']) {
      const r = await run(repo, mode);
      expect(r.exitCode).toBe(1);
      expect(r.err).toContain('tracked files');
    }
    expect(await exists(path.join(repo, '.ai-kit'))).toBe(false);
  });

  it('global without --adopt refuses untracked content and is atomic', async () => {
    const repo = path.join(tmp, 'd1');
    await mkrepo(repo);
    await fs.mkdir(path.join(repo, 'docs/plans'), { recursive: true });
    await fs.writeFile(path.join(repo, 'docs/plans/old.md'), 'old');
    const r = await run(repo, 'global');
    expect(r.exitCode).toBe(1);
    expect(r.err).toContain('--adopt');
    expect(await exists(path.join(repo, '.ai-kit'))).toBe(false); // no half-attach
  });

  it('global --adopt migrates untracked content into the store', async () => {
    const repo = path.join(tmp, 'd2');
    await mkrepo(repo);
    await fs.mkdir(path.join(repo, 'docs/plans'), { recursive: true });
    await fs.writeFile(path.join(repo, 'docs/plans/old.md'), 'old');
    expect((await run(repo, 'global', '--adopt')).exitCode).toBe(0);
    expect(await fs.readFile(path.join(repo, 'docs/plans/old.md'), 'utf8')).toBe('old');
    expect((await fs.lstat(path.join(repo, 'docs/plans'))).isSymbolicLink()).toBe(true);
    expect(clean(repo)).toBe(true);
  });

  it('--adopt is rejected for local', async () => {
    const repo = path.join(tmp, 'e1');
    await mkrepo(repo);
    const r = await run(repo, 'local', '--adopt');
    expect(r.exitCode).toBe(1);
    expect(r.err).toContain("only valid with 'global'");
  });

  it('local refuses to run over a global symlink', async () => {
    const repo = path.join(tmp, 'e2');
    await mkrepo(repo);
    await run(repo, 'global');
    const r = await run(repo, 'local');
    expect(r.exitCode).toBe(1);
    expect(r.err).toContain('detach');
  });

  it('detach removes symlinks and exclusion but keeps store data', async () => {
    const repo = path.join(tmp, 'f');
    await mkrepo(repo);
    await run(repo, 'global');
    await fs.writeFile(path.join(repo, '.ai-kit', 'project.yml'), 'x');
    const target = await fs.readlink(path.join(repo, '.ai-kit'));
    expect((await run(repo, 'detach')).exitCode).toBe(0);
    expect(await exists(path.join(repo, '.ai-kit'))).toBe(false);
    expect(await fs.readFile(path.join(target, 'project.yml'), 'utf8')).toBe('x');
    const ex = await fs.readFile(path.join(repo, '.git', 'info', 'exclude'), 'utf8');
    expect(ex).not.toContain(BLOCK_BEGIN);
  });

  it('detach leaves symlinks that point outside the store alone', async () => {
    const repo = path.join(tmp, 'g');
    await mkrepo(repo);
    const foreign = path.join(tmp, 'foreign');
    await fs.mkdir(foreign);
    await fs.symlink(foreign, path.join(repo, '.ai-kit'), 'dir');
    await run(repo, 'detach');
    expect((await fs.lstat(path.join(repo, '.ai-kit'))).isSymbolicLink()).toBe(true);
  });

  it('linked worktree: exclude lives in the common git dir', async () => {
    const repo = path.join(tmp, 'h');
    await mkrepo(repo);
    const wt = path.join(tmp, 'h-wt');
    git(repo, 'worktree', 'add', '-q', wt, '-b', 'wt');
    expect((await run(wt, 'local')).exitCode).toBe(0);
    expect(await fs.readFile(path.join(repo, '.git', 'info', 'exclude'), 'utf8')).toContain(BLOCK_BEGIN);
    expect(clean(wt)).toBe(true);
  });

  it('status reports mode and invisibility; fails closed when not attached', async () => {
    const repo = path.join(tmp, 'i');
    await mkrepo(repo);
    await fs.mkdir(path.join(repo, '.ai-kit'));
    await fs.writeFile(path.join(repo, '.ai-kit', 'x'), 'x');
    const before = await run(repo, 'status');
    expect(before.exitCode).toBe(1); // leaking
    await run(repo, 'local');
    const after = await run(repo, 'status');
    expect(after.exitCode).toBe(0);
    expect(after.out).toContain('exclude block: present');
  });

  it('errors outside a git repo and on unknown subcommand', async () => {
    const plain = path.join(tmp, 'plain');
    await fs.mkdir(plain);
    expect((await run(plain, 'local')).err).toContain('not inside a git repository');
    expect((await run(plain, 'bogus')).exitCode).toBe(1);
    expect((await run(plain)).exitCode).toBe(1);
    expect((await run(plain, '--help')).exitCode).toBe(0);
  });
});
