// plugins/secret-guard/tests/manifest.test.ts
//
// Guards the Claude Code plugin contract for secret-guard, mirroring what
// `claude plugin validate` and the host loader enforce (official docs,
// verified November 2026):
//   1. hooks/hooks.json declares `modules` — paths relative to the hooks/
//      DIRECTORY — that resolve to real files IN THE REPOSITORY. The
//      shipped layout points at the TypeScript source (`./register.ts`):
//      Claude Code loads .ts hooks modules directly, with no build step.
//   2. The module graph is SELF-CONTAINED: relative imports plus the one
//      allowed bare import, 'claude-code' — no workspace packages, no
//      node builtins (ADR-0006 independently installable plugins).
//   3. The TypeScript is ERASABLE (no enums, no namespaces).
//   4. Event names are string literals; each event+matcher registers once.
//   5. Gated registrations (tool.call WITH a matcher — the ones that can
//      deny) chain .catch so a throw or timeout refuses the action.
//   6. Every $.state { plugin, key } used is named in the contract that
//      plugin.json's "types" field points at.

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

function allowedSpecifier(spec: string): boolean {
  return spec.startsWith('.') || spec.startsWith('/') || spec === 'claude-code';
}

async function collectGraph(entry: string): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = await fs.readFile(file, 'utf8');
    const specifiers = [...source.matchAll(/(?:from\s*|import\s*)(['"])([^'"]+)\1/g)].map(
      (m) => m[2] as string,
    );
    for (const spec of specifiers) {
      if (!allowedSpecifier(spec) || spec === 'claude-code') continue;
      const resolved = path.resolve(path.dirname(file), spec);
      for (const candidate of [`${resolved}.ts`, `${resolved}.tsx`, resolved, path.join(resolved, 'index.ts')]) {
        if ((await exists(candidate)) && !candidate.endsWith('.js')) {
          queue.push(candidate);
          break;
        }
      }
    }
  }
  return [...seen];
}

describe('hooks manifest', () => {
  it('declares the TypeScript source module, resolvable relative to hooks/', async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(hooksDir, 'hooks.json'), 'utf8')) as {
      description?: unknown;
      modules?: unknown;
    };
    expect(typeof manifest.description).toBe('string');
    expect(manifest.description).not.toBe('');
    expect(manifest.modules).toEqual(['./register.ts']);
    expect(await exists(path.resolve(hooksDir, './register.ts'))).toBe(true);
  });

  it('ships a self-contained module graph (relative imports + claude-code only)', async () => {
    const graph = await collectGraph(path.join(hooksDir, 'register.ts'));
    expect(graph.length).toBeGreaterThan(1); // register.ts + the vendored detector
    for (const file of graph) {
      const source = await fs.readFile(file, 'utf8');
      const specifiers = [...source.matchAll(/(?:from\s*|import\s*)(['"])([^'"]+)\1/g)].map(
        (m) => m[2] as string,
      );
      const forbidden = specifiers.filter((spec) => !allowedSpecifier(spec));
      expect(forbidden, `${path.relative(pluginRoot, file)} imports ${forbidden.join(', ')}`).toEqual(
        [],
      );
      expect(source, `${path.relative(pluginRoot, file)} uses dynamic import()`).not.toMatch(
        /(?<!\.)\bimport\s*\(/,
      );
    }
  });

  it('ships erasable TypeScript (no enums or namespaces)', async () => {
    const graph = await collectGraph(path.join(hooksDir, 'register.ts'));
    for (const file of graph) {
      const source = await fs.readFile(file, 'utf8');
      expect(source, `${path.relative(pluginRoot, file)} declares an enum`).not.toMatch(
        /^\s*(export\s+)?(const\s+)?enum\s/m,
      );
      expect(source, `${path.relative(pluginRoot, file)} declares a namespace`).not.toMatch(
        /^\s*(export\s+)?namespace\s/m,
      );
    }
  });

  it('registers each event with a string-literal name; matchers are distinct', async () => {
    const source = await fs.readFile(path.join(hooksDir, 'register.ts'), 'utf8');
    const eventNames = [...source.matchAll(/\bon\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string);
    expect(eventNames).toContain('tool.call');
    // One registration per event+matcher (a repeated identical matcher
    // fails the load). secret-guard registers tool.call with the
    // Write/NotebookEdit matcher, the Edit matcher, the Bash matcher, and
    // once with no matcher (the result redactor) — four distinct
    // registrations of the same event.
    const gated = [...source.matchAll(/\bon\(\s*'tool\.call',\s*\{/g)];
    const bare = [...source.matchAll(/\bon\(\s*'tool\.call',\s*async/g)];
    expect(gated.length).toBe(3);
    expect(bare.length).toBe(1);
  });

  it('chains .catch on every GATED registration (fail closed)', async () => {
    const source = await fs.readFile(path.join(hooksDir, 'register.ts'), 'utf8');
    // Gated = tool.call WITH a matcher (the deny-capable handlers). The
    // no-matcher result redactor observes and never blocks, so it carries
    // no .catch.
    const gated = [...source.matchAll(/\bon\(\s*'tool\.call',\s*\{/g)];
    expect(gated.length).toBe(3);
    const catches = [...source.matchAll(/\}\)\s*\.catch\(/g)];
    expect(catches.length).toBeGreaterThanOrEqual(gated.length);
  });

  it('declares every $.state key it uses in the type contract', async () => {
    const manifest = JSON.parse(
      await fs.readFile(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'),
    ) as { types?: string };
    expect(typeof manifest.types).toBe('string');
    expect(manifest.types?.endsWith('.d.ts')).toBe(true);
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
      expect(contract).toContain(pluginName);
      expect(contract).toContain(key);
    }
  });
});
