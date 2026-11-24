// packages/cli/src/commands/plugin-linker.test.ts
//
// Tests the runtime plugin linking introduced to make `kit install` do what
// docs/HOST_INTEGRATIONS.md documents: the four guard plugins land in
// <project>/.claude/plugins/ with hooks module paths that actually resolve.
//
// The shipped manifests declare `./register.ts` (TypeScript source, loaded
// directly by Claude Code — no build step), so the fixtures below write a
// register.ts source file, not a dist bundle.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RUNTIME_PLUGIN_NAMES,
  linkRuntimePlugins,
  resolveKitPluginsDir,
  validatePluginHooks,
} from './plugin-linker.js';

async function makeFakeKit(kitRoot: string, complete: boolean): Promise<void> {
  for (const name of RUNTIME_PLUGIN_NAMES) {
    const pluginDir = path.join(kitRoot, 'plugins', name);
    await fs.mkdir(path.join(pluginDir, '.claude-plugin'), { recursive: true });
    await fs.mkdir(path.join(pluginDir, 'hooks'), { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name, version: '0.8.0', description: `${name} test plugin` }),
      'utf8',
    );
    await fs.writeFile(
      path.join(pluginDir, 'hooks', 'hooks.json'),
      JSON.stringify({ description: `${name} hooks`, modules: ['./register.ts'] }),
      'utf8',
    );
    if (complete) {
      // The shipped layout: TypeScript source inside hooks/, committed.
      await fs.writeFile(
        path.join(pluginDir, 'hooks', 'register.ts'),
        'export function register(): void {}\n',
        'utf8',
      );
    }
  }
}

describe('plugin-linker', () => {
  it('links all four plugins and the hooks modules resolve through the link', async () => {
    const kitRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-kitroot-'));
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-project-'));
    try {
      await makeFakeKit(kitRoot, true);
      const results = await linkRuntimePlugins(project, kitRoot);
      expect(results).toHaveLength(4);
      for (const r of results) {
        expect(r.status).toBe('linked');
        // The declared hooks module must exist THROUGH the project symlink —
        // exactly what the Claude Code plugin validator checks.
        const throughLink = path.resolve(
          path.dirname(r.linkPath),
          path.basename(r.linkPath),
          'hooks/register.ts',
        );
        await expect(fs.access(throughLink)).resolves.toBeUndefined();
      }
      // Idempotent: re-running reports already-linked.
      const again = await linkRuntimePlugins(project, kitRoot);
      for (const r of again) expect(r.status).toBe('already-linked');
    } finally {
      await fs.rm(kitRoot, { recursive: true, force: true });
      await fs.rm(project, { recursive: true, force: true });
    }
  });

  it('reports incomplete (with fix instructions) when the hooks module is missing', async () => {
    const kitRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-kitroot-'));
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-project-'));
    try {
      await makeFakeKit(kitRoot, false);
      const results = await linkRuntimePlugins(project, kitRoot);
      for (const r of results) {
        expect(r.status).toBe('incomplete');
        expect(r.detail).toContain('incomplete');
        // And crucially: no symlink was created for a broken plugin.
        await expect(fs.lstat(r.linkPath)).rejects.toThrow();
      }
    } finally {
      await fs.rm(kitRoot, { recursive: true, force: true });
      await fs.rm(project, { recursive: true, force: true });
    }
  });

  it('validatePluginHooks flags a manifest pointing at a missing module', async () => {
    const kitRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-kitroot-'));
    try {
      await makeFakeKit(kitRoot, false);
      const dir = path.join(kitRoot, 'plugins', 'sdlc-guard');
      const res = await validatePluginHooks(dir);
      expect(res.ok).toBe(false);
      expect(res.missing).toContain('./register.ts');
    } finally {
      await fs.rm(kitRoot, { recursive: true, force: true });
    }
  });

  it('validatePluginHooks resolves module paths relative to the hooks/ directory (like Claude Code)', async () => {
    const kitRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-kitroot-'));
    try {
      // A manifest whose path resolves only against hooks/: the module
      // lives next to the manifest, not at the plugin root.
      const pluginDir = path.join(kitRoot, 'plugins', 'sdlc-guard');
      await fs.mkdir(path.join(pluginDir, 'hooks'), { recursive: true });
      await fs.writeFile(
        path.join(pluginDir, 'hooks', 'register.ts'),
        'export function register(): void {}',
        'utf8',
      );
      await fs.writeFile(
        path.join(pluginDir, 'hooks', 'hooks.json'),
        JSON.stringify({ modules: ['./register.ts'] }),
        'utf8',
      );
      const res = await validatePluginHooks(pluginDir);
      expect(res.ok).toBe(true);
      expect(res.missing).toEqual([]);
    } finally {
      await fs.rm(kitRoot, { recursive: true, force: true });
    }
  });

  it('resolveKitPluginsDir returns null for a layout without plugins/', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-empty-'));
    try {
      expect(resolveKitPluginsDir(empty)).toBeNull();
    } finally {
      await fs.rm(empty, { recursive: true, force: true });
    }
  });

  describe('ownership: never adopt or replace something the kit did not create', () => {
    const withKit = async (
      fn: (kitRoot: string, project: string, linkPath: (n: string) => string) => Promise<void>,
    ): Promise<void> => {
      const kitRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-kitroot-'));
      const project = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-project-'));
      try {
        await makeFakeKit(kitRoot, true);
        await fn(kitRoot, project, (n) => path.join(project, '.claude', 'plugins', n));
      } finally {
        await fs.rm(kitRoot, { recursive: true, force: true });
        await fs.rm(project, { recursive: true, force: true });
      }
    };
    const only = (rs: Awaited<ReturnType<typeof linkRuntimePlugins>>, name: string) =>
      rs.find((r) => r.name === name)!;

    it('reports conflict for a symlink to somewhere else and leaves it untouched', async () => {
      await withKit(async (kitRoot, project, link) => {
        const foreign = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-foreign-'));
        await fs.mkdir(path.dirname(link('sdlc-guard')), { recursive: true });
        await fs.symlink(foreign, link('sdlc-guard'), 'dir');
        const r = only(await linkRuntimePlugins(project, kitRoot), 'sdlc-guard');
        expect(r.status).toBe('conflict');
        expect(await fs.readlink(link('sdlc-guard'))).toBe(foreign);
        await fs.rm(foreign, { recursive: true, force: true });
      });
    });

    it('reports conflict for a dangling symlink', async () => {
      await withKit(async (kitRoot, project, link) => {
        await fs.mkdir(path.dirname(link('sdlc-guard')), { recursive: true });
        await fs.symlink('/nonexistent/kit-target', link('sdlc-guard'), 'dir');
        expect(only(await linkRuntimePlugins(project, kitRoot), 'sdlc-guard').status).toBe('conflict');
      });
    });

    it('reports conflict (not already-linked) for a real directory at the path', async () => {
      await withKit(async (kitRoot, project, link) => {
        await fs.mkdir(link('sdlc-guard'), { recursive: true });
        await fs.writeFile(path.join(link('sdlc-guard'), 'mine.txt'), 'user data');
        const r = only(await linkRuntimePlugins(project, kitRoot), 'sdlc-guard');
        expect(r.status).toBe('conflict');
        expect(await fs.readFile(path.join(link('sdlc-guard'), 'mine.txt'), 'utf8')).toBe('user data');
      });
    });

    it("reports the verified target for the kit's own link, on create and on re-run", async () => {
      await withKit(async (kitRoot, project) => {
        const first = only(await linkRuntimePlugins(project, kitRoot), 'sdlc-guard');
        const second = only(await linkRuntimePlugins(project, kitRoot), 'sdlc-guard');
        expect(first.status).toBe('linked');
        expect(second.status).toBe('already-linked');
        expect(second.target).toBe(first.target);
        expect(first.target).toBe(path.join(kitRoot, 'plugins', 'sdlc-guard'));
      });
    });

    it('refuses to write through a symlinked .claude directory', async () => {
      await withKit(async (kitRoot, project) => {
        const elsewhere = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-elsewhere-'));
        await fs.symlink(elsewhere, path.join(project, '.claude'), 'dir');
        const results = await linkRuntimePlugins(project, kitRoot);
        for (const r of results) expect(r.status).toBe('conflict');
        expect(await fs.readdir(elsewhere)).toEqual([]);
        await fs.rm(elsewhere, { recursive: true, force: true });
      });
    });

    it('treats a hooks.json that declares no modules as incomplete', async () => {
      await withKit(async (kitRoot, project) => {
        await fs.writeFile(
          path.join(kitRoot, 'plugins', 'sdlc-guard', 'hooks', 'hooks.json'),
          JSON.stringify({ modules: [] }),
        );
        expect(only(await linkRuntimePlugins(project, kitRoot), 'sdlc-guard').status).toBe('incomplete');
      });
    });
  });
});
