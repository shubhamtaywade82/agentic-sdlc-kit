// plugins/model-router/tests/manifest.test.ts
//
// Guards the Claude Code plugin contract: every module path declared in
// hooks/hooks.json must resolve to a real file relative to the plugin root.
// This is exactly what `claude plugin validate` enforces — a manifest that
// points at a non-existent module makes the plugin unloadable.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe('hooks manifest', () => {
  it('declares modules that exist (relative to the plugin root)', async () => {
    const manifest = JSON.parse(
      await fs.readFile(path.join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'),
    ) as { modules?: unknown };
    expect(Array.isArray(manifest.modules)).toBe(true);
    const modules = manifest.modules as string[];
    expect(modules.length).toBeGreaterThan(0);

    for (const mod of modules) {
      // The shipped layout compiles TypeScript to dist/, so declared module
      // paths must point there — never at a .ts source or the repo root.
      expect(mod.startsWith('./dist/')).toBe(true);

      // The TypeScript source for the compiled module must exist.
      const src = path.join(pluginRoot, mod.replace(/^\.\/dist\//, '').replace(/\.js$/, '.ts'));
      expect(await exists(src)).toBe(true);

      // When the plugin has been built (pnpm run build runs before tests in
      // `pnpm verify`), the compiled module must exist at the declared path.
      if (await exists(path.join(pluginRoot, 'dist'))) {
        expect(await exists(path.join(pluginRoot, mod))).toBe(true);
      }
    }
  });
});
