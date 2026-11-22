import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldGreenfieldApp } from '../workflows/app-workflow.js';
import { canonicalStackId, commandsForStack } from './stack-commands.js';

describe('stack command source', () => {
  it('accepts README aliases and maps them to canonical pack ids', () => {
    expect(canonicalStackId('react-spa')).toBe('react-typescript');
    expect(canonicalStackId('rails-hotwire')).toBe('ruby-rails');
    expect(canonicalStackId('python')).toBe('python');
  });

  it('returns undefined for an unknown stack instead of a default', () => {
    expect(canonicalStackId('cobol')).toBeUndefined();
    expect(commandsForStack('cobol')).toBeUndefined();
  });

  it('gives Python pytest, ruff and mypy, never npm', () => {
    const cmds = commandsForStack('python');
    expect(cmds?.test).toEqual([['python3', '-m', 'pytest']]);
    expect(cmds?.lint).toEqual([['ruff', 'check', '.']]);
    expect(cmds?.typecheck).toEqual([['mypy', '.']]);
    expect(JSON.stringify(cmds)).not.toMatch(/npm/);
  });

  it('gives Rails bundle-exec commands', () => {
    expect(commandsForStack('ruby-rails')?.test).toEqual([['bundle', 'exec', 'rspec']]);
    expect(commandsForStack('ruby-rails')?.lint).toEqual([['bundle', 'exec', 'rubocop']]);
  });

  it('uses `npm run` for non-test scripts when the project manager is npm', () => {
    const cmds = commandsForStack('node-typescript', { packageManager: 'npm' });
    expect(cmds?.test).toEqual([['npm', 'test']]);
    expect(cmds?.lint).toEqual([['npm', 'run', 'lint']]);
    expect(cmds?.build).toEqual([['npm', 'run', 'build']]);
  });

  it('uses pnpm scripts unchanged for pnpm and leaves non-Node commands alone', () => {
    expect(commandsForStack('node-typescript', { packageManager: 'pnpm' })?.lint).toEqual([['pnpm', 'lint']]);
    expect(commandsForStack('python', { packageManager: 'npm' })?.test).toEqual([['python3', '-m', 'pytest']]);
  });
});

describe('greenfield app profile per stack', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'greenfield-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it.each([
    ['python', "['python3', '-m', 'pytest']"],
    ['ruby-rails', "['bundle', 'exec', 'rspec']"],
    ['go', "['go', 'test', './...']"],
    ['react-spa', "['npm', 'test']"],
    ['node-typescript', "['npm', 'test']"],
  ])('writes the %s commands into .ai-kit/project.yml', async (stack, expected) => {
    const res = await scaffoldGreenfieldApp({ name: `app-${stack}`, targetDir: root, stack });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const yml = await fs.readFile(res.value.profilePath, 'utf8');
    expect(yml).toContain(expected);
  });

  it('never writes npm commands for a non-Node stack', async () => {
    const res = await scaffoldGreenfieldApp({ name: 'py', targetDir: root, stack: 'python' });
    if (!res.ok) throw new Error('scaffold failed');
    expect(await fs.readFile(res.value.profilePath, 'utf8')).not.toContain('npm');
  });

  it('rejects an unknown stack and writes nothing', async () => {
    const res = await scaffoldGreenfieldApp({ name: 'x', targetDir: root, stack: 'cobol' });
    expect(res.ok).toBe(false);
    await expect(fs.access(path.join(root, 'x'))).rejects.toBeTruthy();
  });
});

describe('plain Ruby (no Rails)', () => {
  it('gives bundle-exec RSpec and RuboCop for the ruby pack', () => {
    expect(commandsForStack('ruby')?.test).toEqual([['bundle', 'exec', 'rspec']]);
    expect(commandsForStack('ruby')?.lint).toEqual([['bundle', 'exec', 'rubocop']]);
  });
});
