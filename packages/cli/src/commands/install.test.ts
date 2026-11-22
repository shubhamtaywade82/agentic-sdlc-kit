// packages/cli/src/commands/install.test.ts
//
// Regression: `kit install --dir <target>` must write into <target>, never
// into the process cwd. Before this fix --dir was not parsed at all, so the
// profile, ownership manifest and plugin links all landed in cwd.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, type TempDir } from '@agentic-sdlc-kit/testing';
import { installCommand } from './install.js';
import type { CommandContext } from './types.js';

const makeCtx = (argv: string[], cwd: string): CommandContext & { err: string[] } => {
  const err: string[] = [];
  return { argv, cwd, stdout: () => undefined, stderr: (s) => void err.push(s), err };
};

const exists = (p: string): Promise<boolean> =>
  fs.access(p).then(
    () => true,
    () => false,
  );

describe('installCommand --dir', () => {
  let target: TempDir;
  let elsewhere: TempDir;

  beforeEach(async () => {
    target = await makeTempDir('kit-install-target-');
    elsewhere = await makeTempDir('kit-install-cwd-');
  });
  afterEach(async () => {
    await target.cleanup();
    await elsewhere.cleanup();
  });

  it('writes the profile and ownership manifest under --dir, not under cwd', async () => {
    const ctx = makeCtx(['--profile', 'minimal', '--dir', target.path], elsewhere.path);
    const r = await installCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    expect(await exists(path.join(target.path, '.ai-kit', 'project.yml'))).toBe(true);
    expect(await exists(path.join(target.path, '.ai-kit', 'ownership-manifest.json'))).toBe(true);
    expect(await exists(path.join(elsewhere.path, '.ai-kit'))).toBe(false);
  });

  it('fails with exit 1 when --dir does not exist, and writes nothing', async () => {
    const missing = path.join(elsewhere.path, 'nope');
    const ctx = makeCtx(['--profile', 'minimal', '--dir', missing], elsewhere.path);
    const r = await installCommand.run(ctx);
    expect(r.exitCode).toBe(1);
    expect(ctx.err.join('')).toMatch(/does not exist/);
    expect(await exists(path.join(elsewhere.path, '.ai-kit'))).toBe(false);
  });

  it('fails with exit 1 when --dir has no value', async () => {
    const ctx = makeCtx(['--profile', 'minimal', '--dir'], elsewhere.path);
    const r = await installCommand.run(ctx);
    expect(r.exitCode).toBe(1);
    expect(await exists(path.join(elsewhere.path, '.ai-kit'))).toBe(false);
  });
});
