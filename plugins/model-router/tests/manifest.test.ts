// plugins/model-router/tests/manifest.test.ts
//
// Guards the Claude Code plugin contract, mirroring the two rules
// `claude plugin validate` enforces for modules declared in hooks/hooks.json:
//   1. module paths resolve relative to the hooks/ DIRECTORY (the directory
//      containing hooks.json), not the plugin root;
//   2. the shipped hooks module must be self-contained: it may import its
//      own files (relative paths), node: builtins, and "claude-code" —
//      nothing else (this is why the build bundles register.ts with
//      scripts/bundle-hooks.mjs instead of shipping plain tsc output).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hooksDir = path.join(pluginRoot, 'hooks');

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Import specifiers a hooks module may use: its own files (relative paths)
// and the host SDK — NOTHING else, not even node: builtins. Anything more
// makes the plugin unloadable in Claude Code ("a hooks module imports its
// own files by relative path and 'claude-code', nothing else").
function allowedSpecifier(spec: string): boolean {
  return spec.startsWith('.') || spec.startsWith('/') || spec === 'claude-code';
}

describe('hooks manifest', () => {
  it('declares modules that resolve relative to the hooks/ directory', async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(hooksDir, 'hooks.json'), 'utf8')) as {
      modules?: unknown;
    };
    expect(Array.isArray(manifest.modules)).toBe(true);
    const modules = manifest.modules as string[];
    expect(modules.length).toBeGreaterThan(0);

    for (const mod of modules) {
      // The shipped layout compiles TypeScript to dist/ (a sibling of
      // hooks/), so the declared path points UP out of hooks/ — never at a
      // .ts source. Claude Code resolves it against hooks/, so we do too.
      expect(mod.startsWith('../dist/')).toBe(true);

      const resolved = path.resolve(hooksDir, mod);
      expect(path.basename(resolved)).toBe('register.js');

      // The TypeScript source for the compiled module must exist.
      const src = path.join(
        pluginRoot,
        mod.replace(/^(\.\.\/)+dist\//, '').replace(/\.js$/, '.ts'),
      );
      expect(await exists(src)).toBe(true);

      // When the plugin has been built (pnpm run build runs before tests in
      // `pnpm verify`), the compiled module must exist at the declared path.
      if (await exists(path.join(pluginRoot, 'dist'))) {
        expect(await exists(resolved)).toBe(true);
      }
    }
  });

  it('ships a self-contained hooks module (no bare imports)', async () => {
    const built = path.join(pluginRoot, 'dist', 'hooks', 'register.js');
    if (!(await exists(built))) {
      // Not built in this checkout; the layout test above still guards the
      // manifest. `pnpm verify` builds before testing, so CI covers this.
      return;
    }
    const code = await fs.readFile(built, 'utf8');
    const forbidden = [...code.matchAll(/(?:from\s*|import\s*)(['"])([^'"]+)\1/g)]
      .map((m) => m[2])
      .filter((spec) => !allowedSpecifier(spec));
    expect(forbidden).toEqual([]);
  });

  it('declares every $.state key it uses in the type contract', async () => {
    // The real Claude Code validator requires every state reference
    // { plugin, key } used by the hooks module to be named in the
    // contract that plugin.json's "types" field points at. This test
    // keeps the contract and the code in sync.
    const manifest = JSON.parse(
      await fs.readFile(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'),
    ) as { types?: string };
    expect(typeof manifest.types).toBe('string');
    expect(manifest.types?.endsWith('.d.ts')).toBe(true);
    // No '..': the contract must stay inside the plugin directory.
    expect(manifest.types?.includes('..')).toBe(false);

    const contractPath = path.resolve(pluginRoot, manifest.types ?? '');
    const contract = await fs.readFile(contractPath, 'utf8');
    expect(contract).toContain("declare module 'claude-code'");

    const source = await fs.readFile(path.join(pluginRoot, 'hooks', 'register.ts'), 'utf8');
    const refs = [...source.matchAll(/\{\s*plugin:\s*'([a-z-]+)',\s*key:\s*'([a-z-]+)'\s*\}/g)];
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const [, pluginName, key] = ref;
      expect(pluginName).toBe(path.basename(pluginRoot));
      // The contract must name this key under the plugin's PluginState
      // entry. We check that both the plugin name and the key appear.
      expect(contract).toContain(pluginName);
      expect(contract).toContain(key);
    }
  });
});
