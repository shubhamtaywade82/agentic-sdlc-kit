// packages/cli/src/commands/plugin-linker.test.ts
//
// Link + validation contract for runtime plugins. A plugin is linked only when
// its hooks use the official command-hook format AND every built entry it
// references exists. Legacy plugins are reported, never linked.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '@agentic-sdlc-kit/testing';
import {
  linkRuntimePlugins,
  resolveKitPluginsDir,
  validatePluginHooks,
} from './plugin-linker.js';

const COMMAND_HOOKS = {
  hooks: {
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command: 'node "${CLAUDE_PLUGIN_ROOT}/dist/hooks/guard.js"',
            onFailure: 'block',
          },
        ],
      },
    ],
  },
};

async function writePlugin(
  kitRoot: string,
  name: string,
  hooksJson: unknown,
  builtEntry: boolean,
): Promise<void> {
  const dir = path.join(kitRoot, 'plugins', name);
  await fs.mkdir(path.join(dir, '.claude-plugin'), { recursive: true });
  await fs.mkdir(path.join(dir, 'hooks'), { recursive: true });
  await fs.writeFile(path.join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name }));
  await fs.writeFile(path.join(dir, 'hooks', 'hooks.json'), JSON.stringify(hooksJson));
  if (builtEntry) {
    await fs.mkdir(path.join(dir, 'dist', 'hooks'), { recursive: true });
    await fs.writeFile(path.join(dir, 'dist', 'hooks', 'guard.js'), '');
  }
}

async function makeKit(kitRoot: string, opts: { sdlcBuilt: boolean }): Promise<void> {
  await writePlugin(kitRoot, 'sdlc-guard', COMMAND_HOOKS, opts.sdlcBuilt);
  await writePlugin(kitRoot, 'secret-guard', COMMAND_HOOKS, true);
  await writePlugin(kitRoot, 'model-router', { modules: ['./register.ts'] }, false);
  await writePlugin(kitRoot, 'run-observer', { modules: ['./register.ts'] }, false);
}

describe('plugin-linker', () => {
  it('links command-hook plugins and reports legacy plugins as not-converted', async () => {
    const kit = await makeTempDir('kit-linker-kit-');
    const project = await makeTempDir('kit-linker-project-');
    try {
      await makeKit(kit.path, { sdlcBuilt: true });
      const results = await linkRuntimePlugins(project.path, kit.path);
      const byName = Object.fromEntries(results.map((r) => [r.name, r.status]));
      expect(byName).toEqual({
        'sdlc-guard': 'linked',
        'secret-guard': 'linked',
        'model-router': 'not-converted',
        'run-observer': 'not-converted',
      });
      const link = path.join(project.path, '.claude', 'plugins', 'sdlc-guard');
      expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);
      expect(await fs.access(path.join(link, 'dist', 'hooks', 'guard.js')).then(() => true, () => false)).toBe(true);
      expect(await fs.access(path.join(project.path, '.claude', 'plugins', 'model-router')).then(() => true, () => false)).toBe(false);
    } finally {
      await kit.cleanup();
      await project.cleanup();
    }
  });

  it('reports incomplete with a build instruction when the built hook entry is missing', async () => {
    const kit = await makeTempDir('kit-linker-kit-');
    const project = await makeTempDir('kit-linker-project-');
    try {
      await makeKit(kit.path, { sdlcBuilt: false });
      const results = await linkRuntimePlugins(project.path, kit.path);
      const sdlc = results.find((r) => r.name === 'sdlc-guard');
      expect(sdlc?.status).toBe('incomplete');
      expect(sdlc?.detail).toMatch(/pnpm run build/);
      expect(sdlc?.detail).toMatch(/dist\/hooks\/guard\.js/);
    } finally {
      await kit.cleanup();
      await project.cleanup();
    }
  });

  it('validatePluginHooks checks every ${CLAUDE_PLUGIN_ROOT} path a command references', async () => {
    const kit = await makeTempDir('kit-linker-kit-');
    try {
      await writePlugin(kit.path, 'p', COMMAND_HOOKS, false);
      const v = await validatePluginHooks(path.join(kit.path, 'plugins', 'p'));
      expect(v).toEqual({ format: 'command-hooks', ok: false, missing: ['dist/hooks/guard.js'] });
    } finally {
      await kit.cleanup();
    }
  });

  it('detects the legacy modules format and an unreadable manifest', async () => {
    const kit = await makeTempDir('kit-linker-kit-');
    try {
      await writePlugin(kit.path, 'old', { modules: ['./register.ts'] }, false);
      expect((await validatePluginHooks(path.join(kit.path, 'plugins', 'old'))).format).toBe('legacy-modules');
      expect((await validatePluginHooks(path.join(kit.path, 'plugins', 'nope'))).format).toBe('unreadable');
    } finally {
      await kit.cleanup();
    }
  });

  it('resolveKitPluginsDir returns null for a layout without plugins/', async () => {
    const kit = await makeTempDir('kit-linker-empty-');
    try {
      expect(resolveKitPluginsDir(kit.path)).toBeNull();
    } finally {
      await kit.cleanup();
    }
  });
});
