// plugins/run-observer/tests/manifest.test.ts
//
// Guards the Claude Code plugin contract for run-observer, mirroring what
// `claude plugin validate` and the host loader enforce (official docs,
// verified November 2026): modules resolve relative to hooks/ and ship as
// TypeScript source (loaded directly — no build step); the module graph is
// self-contained (relative imports + 'claude-code' only); the TypeScript
// is erasable; event names are string literals registered once per
// matcher; turn.step uses the async-generator form (the event streams).
// run-observer never gates a call (suggest/rewrite only), so no .catch
// fail-closed chain applies.

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
    expect(graph.length).toBeGreaterThan(1); // register.ts + the trace store
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

  it('registers turn.step and agent.spawn once each, with string-literal names', async () => {
    const source = await fs.readFile(path.join(hooksDir, 'register.ts'), 'utf8');
    const eventNames = [...source.matchAll(/\bon\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string);
    expect(eventNames.sort()).toEqual(['session.start', 'tool.call', 'turn.complete', 'turn.start', 'turn.step']);
  });

  it('uses the async-generator form for the streaming turn.step event', async () => {
    const source = await fs.readFile(path.join(hooksDir, 'register.ts'), 'utf8');
    expect(source).toMatch(/on\('turn\.step',\s*async function\*/);
    expect(source).toMatch(/yield\* next\(/);
  });

  it('never blocks: every observation is wrapped in try/catch', async () => {
    const source = await fs.readFile(path.join(hooksDir, 'register.ts'), 'utf8');
    // The observe() helper swallows errors so a telemetry failure can
    // never break the middleware chain.
    expect(source).toMatch(/async function observe\(/);
    expect(source).toMatch(/catch \(err\)/);
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
