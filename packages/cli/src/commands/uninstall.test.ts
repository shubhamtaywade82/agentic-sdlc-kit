import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, type TempDir } from '@agentic-sdlc-kit/testing';
import { installCommand } from './install.js';
import { uninstallCommand } from './uninstall.js';
import type { CommandContext } from './types.js';

const ctxFor = (argv: string[], cwd: string): CommandContext => ({
  argv,
  cwd,
  stdout: () => undefined,
  stderr: () => undefined,
});

const exists = (p: string): Promise<boolean> =>
  fs.access(p).then(
    () => true,
    () => false,
  );

describe('uninstallCommand', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await makeTempDir('kit-uninstall-');
    await installCommand.run(ctxFor(['--profile', 'full-sdlc', '--dir', dir.path], dir.path));
  });
  afterEach(() => dir.cleanup());

  it('removes unchanged installed files and the manifest', async () => {
    const r = await uninstallCommand.run(ctxFor(['--dir', dir.path], dir.path));
    expect(r.exitCode).toBe(0);
    expect(await exists(path.join(dir.path, 'docs/specifications/.gitkeep'))).toBe(false);
    expect(await exists(path.join(dir.path, '.ai-kit/ownership-manifest.json'))).toBe(false);
  });

  it('keeps a file the user edited after install', async () => {
    const yml = path.join(dir.path, '.ai-kit/project.yml');
    await fs.appendFile(yml, 'name: mine\n');
    await uninstallCommand.run(ctxFor(['--dir', dir.path], dir.path));
    expect(await exists(yml)).toBe(true);
  });

  it('removes nothing on --dry-run', async () => {
    await uninstallCommand.run(ctxFor(['--dry-run', '--dir', dir.path], dir.path));
    expect(await exists(path.join(dir.path, '.ai-kit/ownership-manifest.json'))).toBe(true);
  });

  it('still owns first-install files after a second install', async () => {
    await installCommand.run(ctxFor(['--profile', 'full-sdlc', '--dir', dir.path], dir.path));
    await uninstallCommand.run(ctxFor(['--dir', dir.path], dir.path));
    expect(await exists(path.join(dir.path, 'docs/specifications/.gitkeep'))).toBe(false);
  });

  it('fails when there is no manifest', async () => {
    const empty = await makeTempDir('kit-uninstall-empty-');
    const r = await uninstallCommand.run(ctxFor(['--dir', empty.path], empty.path));
    await empty.cleanup();
    expect(r.exitCode).toBe(1);
  });
});
