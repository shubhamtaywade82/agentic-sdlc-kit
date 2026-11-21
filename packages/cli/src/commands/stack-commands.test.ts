// CLI-level check that `kit new` and `kit init` derive commands from the stack
// pack. Regression: every stack used to receive npm commands.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, type TempDir } from '@agentic-sdlc-kit/testing';
import { initCommand } from './init.js';
import { newCommand } from './new.js';
import type { CommandContext } from './types.js';

const ctxFor = (argv: string[], cwd: string): CommandContext & { out: string[]; err: string[] } => {
  const out: string[] = [];
  const err: string[] = [];
  return { argv, cwd, stdout: (s) => void out.push(s), stderr: (s) => void err.push(s), out, err };
};

describe('kit new / kit init stack commands', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await makeTempDir('kit-stack-cmds-');
  });
  afterEach(async () => dir.cleanup());

  it('kit new --stack python writes pytest, not npm', async () => {
    const c = ctxFor(['demo', '--stack', 'python', '--dir', dir.path], dir.path);
    expect((await newCommand.run(c)).exitCode).toBe(0);
    const yml = await fs.readFile(path.join(dir.path, 'demo', '.ai-kit', 'project.yml'), 'utf8');
    expect(yml).toContain("['python3', '-m', 'pytest']");
    expect(yml).not.toContain('npm');
  });

  it('kit new --stack react-spa is accepted and stored under the canonical id', async () => {
    const c = ctxFor(['web', '--stack', 'react-spa', '--dir', dir.path], dir.path);
    expect((await newCommand.run(c)).exitCode).toBe(0);
    const yml = await fs.readFile(path.join(dir.path, 'web', '.ai-kit', 'project.yml'), 'utf8');
    expect(yml).toContain('- react-typescript');
  });

  it('kit new rejects an unknown stack with exit 1', async () => {
    const c = ctxFor(['x', '--stack', 'cobol', '--dir', dir.path], dir.path);
    expect((await newCommand.run(c)).exitCode).toBe(1);
    expect(c.err.join('')).toMatch(/unknown stack/);
  });

  it('kit init on a Python repo derives pytest and nothing it cannot confirm', async () => {
    const repo = path.join(dir.path, 'py-shop');
    await fs.mkdir(path.join(repo, 'app'), { recursive: true });
    await fs.writeFile(path.join(repo, 'pyproject.toml'), "[project]\nname='py'\n[tool.pytest.ini_options]\ntestpaths=['tests']\n");
    const c = ctxFor([repo], dir.path);
    expect((await initCommand.run(c)).exitCode).toBe(0);
    const yml = await fs.readFile(path.join(repo, '.ai-kit', 'project.yml'), 'utf8');
    expect(yml).toContain("['python3', '-m', 'pytest']");
    expect(yml).not.toContain('ruff');
    expect(yml).not.toContain('mypy');
  });

  it('kit init on a plain Ruby repo derives bundle-exec RSpec, not Rails commands', async () => {
    const repo = path.join(dir.path, 'rb-lib');
    await fs.mkdir(path.join(repo, 'spec'), { recursive: true });
    await fs.writeFile(path.join(repo, 'Gemfile'), "source 'https://rubygems.org'\ngem 'rspec'\n");
    const c = ctxFor([repo], dir.path);
    expect((await initCommand.run(c)).exitCode).toBe(0);
    const yml = await fs.readFile(path.join(repo, '.ai-kit', 'project.yml'), 'utf8');
    expect(yml).toContain("['bundle', 'exec', 'rspec']");
    expect(yml).not.toContain('rails');
  });
});
