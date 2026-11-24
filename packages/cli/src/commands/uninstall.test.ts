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

  describe('ownership integrity', () => {
    const manifestPath = (): string => path.join(dir.path, '.ai-kit/ownership-manifest.json');
    const readManifest = async (): Promise<{ entries: Array<Record<string, unknown>> }> =>
      JSON.parse(await fs.readFile(manifestPath(), 'utf8'));
    const writeManifest = (m: unknown): Promise<void> =>
      fs.writeFile(manifestPath(), JSON.stringify(m, null, 2));
    const pluginLink = (): string => path.join(dir.path, '.claude/plugins/sdlc-guard');

    it('removes the kit-created plugin links (the link, never its target)', async () => {
      const target = await fs.realpath(pluginLink());
      await uninstallCommand.run(ctxFor(['--dir', dir.path], dir.path));
      expect(await exists(pluginLink())).toBe(false);
      expect(await exists(path.join(target, '.claude-plugin/plugin.json'))).toBe(true);
    });

    it('keeps a recorded link the user has since re-pointed elsewhere', async () => {
      const mine = await makeTempDir('kit-mine-');
      await fs.rm(pluginLink());
      await fs.symlink(mine.path, pluginLink(), 'dir');
      const r = await uninstallCommand.run(ctxFor(['--dir', dir.path], dir.path));
      expect(r.exitCode).toBe(0);
      expect(await fs.readlink(pluginLink())).toBe(mine.path);
      await mine.cleanup();
    });

    it('keeps a real directory at a recorded path and still removes the rest (no crash)', async () => {
      await fs.rm(pluginLink());
      await fs.mkdir(pluginLink());
      await fs.writeFile(path.join(pluginLink(), 'mine.txt'), 'user data');
      const r = await uninstallCommand.run(ctxFor(['--dir', dir.path], dir.path));
      expect(r.exitCode).toBe(0);
      expect(await exists(path.join(pluginLink(), 'mine.txt'))).toBe(true);
      expect(await exists(path.join(dir.path, 'docs/specifications/.gitkeep'))).toBe(false);
      expect(await exists(manifestPath())).toBe(false);
    });

    it('never deletes outside the root, even if the manifest says so', async () => {
      const outside = await makeTempDir('kit-outside-');
      const victim = path.join(outside.path, 'victim.txt');
      await fs.writeFile(victim, 'precious');
      const m = await readManifest();
      m.entries.push({
        ...m.entries[0]!,
        path: path.relative(dir.path, victim),
        sha256: (await import('node:crypto')).createHash('sha256').update('precious').digest('hex'),
      });
      await writeManifest(m);
      await uninstallCommand.run(ctxFor(['--dir', dir.path], dir.path));
      expect(await exists(victim)).toBe(true);
      await outside.cleanup();
    });

    it('still removes a legacy link entry (no recorded target) that points at the kit plugin', async () => {
      const m = await readManifest();
      for (const e of m.entries) delete e['target'];
      await writeManifest(m);
      await uninstallCommand.run(ctxFor(['--dir', dir.path], dir.path));
      expect(await exists(pluginLink())).toBe(false);
    });
  });
});
