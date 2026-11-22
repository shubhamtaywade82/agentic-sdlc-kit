// plugins/sdlc-guard/tests/manifest.test.ts
//
// Guards the Claude Code plugin contract for sdlc-guard, mirroring what
// `claude plugin validate` and the host loader enforce (official docs,
// verified November 2026):
//   1. hooks/hooks.json declares `modules` — paths relative to the hooks/
//      DIRECTORY — that resolve to real files IN THE REPOSITORY. The
//      shipped layout points at the TypeScript source (`./register.ts`):
//      Claude Code loads .ts hooks modules directly, with no build step,
//      so a fresh clone validates without running anything first.
//   2. The module graph is SELF-CONTAINED: every import in register.ts and
//      the files it imports (transitively) is either a relative path or
//      the one allowed bare import, 'claude-code'. Workspace packages and
//      node builtins are forbidden — the plugin must stay independently
//      installable (ADR-0006).
//   3. The TypeScript is ERASABLE (no enums, no namespaces — the host
//      strips types without compiling).
//   4. Every on() call uses a string-literal event name, and each
//      event+matcher combination is registered exactly once.
//   5. Gating hooks (tool.call / tool.check) chain a .catch handler so a
//      throw or timeout refuses the action (fail closed).
//   6. Every $.state { plugin, key } the module uses is named in the
//      contract plugin.json's "types" field points at.

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

/** Import specifiers a hooks module may use: its own files (relative
 * paths) and the host SDK — NOTHING else ("a hooks module imports its own
 * files by relative path and 'claude-code', nothing else"). */
function allowedSpecifier(spec: string): boolean {
  return spec.startsWith('.') || spec.startsWith('/') || spec === 'claude-code';
}

/** Collect the module graph of a .ts file: the file plus every file its
 * (static, top-level) relative imports reach, staying inside the plugin. */
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
      for (const candidate of [
        `${resolved}.ts`,
        `${resolved}.tsx`,
        resolved,
        path.join(resolved, 'index.ts'),
      ]) {
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
    // The module ships in the repository: Claude Code loads .ts directly,
    // so a fresh clone must validate without a build step.
    expect(await exists(path.resolve(hooksDir, './register.ts'))).toBe(true);
  });

  it('ships a self-contained module graph (relative imports + claude-code only)', async () => {
    const graph = await collectGraph(path.join(hooksDir, 'register.ts'));
    expect(graph.length).toBeGreaterThan(1); // register.ts + at least one policy
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

  it('registers each event with a string-literal name, once per matcher', async () => {
    const source = await fs.readFile(path.join(hooksDir, 'register.ts'), 'utf8');
    const eventNames = [...source.matchAll(/\bon\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string);
    expect(eventNames.length).toBeGreaterThan(0);
    // One registration per event+matcher: a bare on('x') twice fails the
    // load ("registered twice without a matcher"), and so does a repeated
    // identical matcher. The events used here are distinct registrations.
    const seen = new Map<string, number>();
    for (const name of eventNames) {
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    // sdlc-guard registers tool.call once (Bash matcher) and tool.check
    // once (Bash matcher) — each event at most once per matcher.
    for (const [name, count] of seen) {
      expect(count, `on('${name}') registered ${count} times`).toBeLessThanOrEqual(2);
    }
    expect(seen.get('tool.call')).toBe(1);
    expect(seen.get('tool.check')).toBe(1);
  });

  it('chains .catch on every gating registration (fail closed)', async () => {
    const source = await fs.readFile(path.join(hooksDir, 'register.ts'), 'utf8');
    const gating = [...source.matchAll(/\bon\(\s*'tool\.(?:call|check)'/g)];
    expect(gating.length).toBeGreaterThan(0);
    const catches = [...source.matchAll(/\}\)\s*\.catch\(/g)];
    expect(catches.length).toBeGreaterThanOrEqual(gating.length);
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
