// packages/core/src/scaffolding/generator.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeScaffold, planScaffold, validateVariables } from './generator.js';
import { InMemoryTemplateRegistry } from './template-registry.js';
import type { ScaffoldRequest, TemplateManifest } from '@agentic-sdlc-kit/contracts';

let tmp: string;
let request: ScaffoldRequest;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-gen-'));
  request = {
    templateId: 'node-typescript-api',
    templateVersion: '1.0.0',
    targetDir: tmp,
    variables: { projectName: 'my-app' },
    execute: false,
  };
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const manifest: TemplateManifest = {
  schemaVersion: 1,
  id: 'node-typescript-api',
  name: 'Node TypeScript API',
  description: 'Express + TypeScript starter.',
  version: '1.0.0',
  stacks: ['node-typescript'],
  variables: [
    {
      name: 'projectName',
      description: 'Package name',
      required: true,
      pattern: '^[a-z][a-z0-9-]*$',
    },
  ],
  files: [
    { path: 'package.json', templated: true, preserve: false },
    { path: 'README.md', templated: false, preserve: false },
    { path: 'tsconfig.json', templated: true, preserve: true },
  ],
  kitCompatibility: '>=0.6.0',
};

// Note: `request` is built inside beforeEach so `targetDir` reflects the
// per-test `tmp` directory.

describe('validateVariables', () => {
  it('returns no errors for a valid set', () => {
    const errs = validateVariables(manifest, { projectName: 'my-app' });
    expect(errs).toEqual([]);
  });
  it('returns an error for a missing required variable', () => {
    const errs = validateVariables(manifest, {});
    expect(errs).toContain('variable projectName is required');
  });
  it('returns an error for a value that does not match the pattern', () => {
    const errs = validateVariables(manifest, { projectName: 'My_App' });
    expect(errs.some((e) => e.includes('does not match pattern'))).toBe(true);
  });
});

describe('planScaffold', () => {
  it('produces a plan with one operation per manifest file', async () => {
    const r = await planScaffold(request, manifest);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.plannedOperations).toHaveLength(3);
      expect(r.value.plannedOperations.map((o) => o.path)).toEqual(
        expect.arrayContaining(['package.json', 'README.md', 'tsconfig.json']),
      );
    }
  });
});

describe('executeScaffold', () => {
  it('writes files using the content provider and records owned files', async () => {
    const plan = await planScaffold(request, manifest);
    if (!plan.ok) throw new Error('plan failed');
    const r = await executeScaffold(plan.value, (p) => `// content for ${p}`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.interrupted).toBe(false);
      expect(r.value.ownedFiles).toHaveLength(3);
      expect(r.value.ownedFiles).toEqual(
        expect.arrayContaining(['package.json', 'README.md', 'tsconfig.json']),
      );
      // Verify the files exist.
      for (const f of r.value.ownedFiles) {
        const stat = await fs.stat(path.resolve(tmp, f));
        expect(stat.isFile()).toBe(true);
      }
    }
  });
});

describe('InMemoryTemplateRegistry', () => {
  it('registers and looks up a template by id', () => {
    const reg = new InMemoryTemplateRegistry();
    reg.register(manifest);
    const r = reg.lookup('node-typescript-api');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.id).toBe('node-typescript-api');
  });
  it('returns the highest semver when no version specified', () => {
    const reg = new InMemoryTemplateRegistry();
    reg.register({ ...manifest, version: '1.0.0' });
    reg.register({ ...manifest, version: '1.2.0' });
    reg.register({ ...manifest, version: '1.1.0' });
    const r = reg.lookup('node-typescript-api');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.version).toBe('1.2.0');
  });
  it('returns an error for an unknown template id', () => {
    const reg = new InMemoryTemplateRegistry();
    const r = reg.lookup('bogus');
    expect(r.ok).toBe(false);
  });
});
