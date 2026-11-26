// scripts/release-preflight.test.ts
//
// Offline tests for the release preflight. The planner and the registry-reply
// parser are pure, so nothing here touches npm. Run with `pnpm run test:tooling`.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRegistryLookup,
  planReleasePreflight,
  type PublishableManifest,
  type RegistryLookup,
} from './release-preflight.js';

const KIT: PublishableManifest[] = [
  { name: '@agentic-sdlc-kit/core', version: '0.9.2', private: false },
  { name: '@agentic-sdlc-kit/cli', version: '0.9.2', private: false },
];
const MODS: PublishableManifest[] = [{ name: '@agentic-mods/cockpit', version: '0.1.0', private: false }];

function absentAll(manifests: readonly PublishableManifest[]): Map<string, RegistryLookup> {
  return new Map(manifests.map((m) => [`${m.name}@${m.version}`, { kind: 'absent' } as const]));
}

describe('planReleasePreflight', () => {
  test('a clean release plans every publishable package', () => {
    const manifests = [...KIT, ...MODS];
    const result = planReleasePreflight({ tag: 'v0.9.2', manifests, registry: absentAll(manifests) });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.plan, [
        '@agentic-sdlc-kit/core@0.9.2',
        '@agentic-sdlc-kit/cli@0.9.2',
        '@agentic-mods/cockpit@0.1.0',
      ]);
    }
  });

  test('a kit package that does not match the release tag blocks the release', () => {
    const manifests = [{ name: '@agentic-sdlc-kit/core', version: '0.9.1', private: false }];
    const result = planReleasePreflight({ tag: 'v0.9.2', manifests, registry: absentAll(manifests) });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors.join('\n'), /0\.9\.1.*0\.9\.2|0\.9\.2.*0\.9\.1/);
  });

  test('mods packages on their own version line do not have to match the tag', () => {
    const manifests = [...KIT, ...MODS];
    const result = planReleasePreflight({ tag: 'v0.9.2', manifests, registry: absentAll(manifests) });
    assert.equal(result.ok, true, 'cockpit at 0.1.0 is not compared with v0.9.2');
  });

  test('a version already on the registry blocks the release and names the package', () => {
    const manifests = KIT;
    const registry = absentAll(manifests);
    registry.set('@agentic-sdlc-kit/core@0.9.2', { kind: 'present', version: '0.9.2' });
    const result = planReleasePreflight({ tag: 'v0.9.2', manifests, registry });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors.join('\n'), /@agentic-sdlc-kit\/core@0\.9\.2.*already/);
  });

  test('a registry lookup that could not be verified fails closed, never as not-published', () => {
    const manifests = KIT;
    const registry = absentAll(manifests);
    registry.set('@agentic-sdlc-kit/cli@0.9.2', { kind: 'error', message: 'ETIMEDOUT' });
    const result = planReleasePreflight({ tag: 'v0.9.2', manifests, registry });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors.join('\n'), /could not verify.*ETIMEDOUT/);
  });

  test('a package with no registry answer at all fails closed', () => {
    const result = planReleasePreflight({ tag: 'v0.9.2', manifests: KIT, registry: new Map() });
    assert.equal(result.ok, false);
  });

  test('zero publishable packages is an error, not an empty release', () => {
    const manifests = [{ name: 'internal', version: '0.0.0', private: true }];
    const result = planReleasePreflight({ tag: 'v0.9.2', manifests, registry: new Map() });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors.join('\n'), /no publishable packages/);
  });

  test('a tag with no publishable kit package to match is an error', () => {
    const modsOnly = planReleasePreflight({ tag: 'v0.9.2', manifests: MODS, registry: absentAll(MODS) });
    assert.equal(modsOnly.ok, false, 'a release tag names the kit line');
    if (!modsOnly.ok) assert.match(modsOnly.errors.join('\n'), /@agentic-sdlc-kit/);
  });

  test('a malformed tag is refused before any registry question is asked', () => {
    const result = planReleasePreflight({ tag: 'release-1', manifests: KIT, registry: absentAll(KIT) });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors.join('\n'), /tag/);
  });

  test('a manual run without a tag still checks that every version is unpublished', () => {
    const registry = absentAll(KIT);
    registry.set('@agentic-sdlc-kit/core@0.9.2', { kind: 'present', version: '0.9.2' });
    const result = planReleasePreflight({ tag: undefined, manifests: KIT, registry });
    assert.equal(result.ok, false);
  });
});

describe('parseRegistryLookup', () => {
  test('a version that exists is reported as present', () => {
    const lookup = parseRegistryLookup({ exitCode: 0, stdout: '"0.9.2"\n', stderr: '' }, '0.9.2');
    assert.deepEqual(lookup, { kind: 'present', version: '0.9.2' });
  });

  test('npm E404 for a missing version is absent (not published)', () => {
    const stdout = JSON.stringify({ error: { code: 'E404', summary: 'No match found for version 0.9.2' } });
    assert.deepEqual(parseRegistryLookup({ exitCode: 1, stdout, stderr: '' }, '0.9.2'), { kind: 'absent' });
  });

  test('a network or auth error is not treated as absent', () => {
    const stdout = JSON.stringify({ error: { code: 'ETIMEDOUT', summary: 'timeout' } });
    assert.equal(parseRegistryLookup({ exitCode: 1, stdout, stderr: '' }, '0.9.2').kind, 'error');
    const forbidden = JSON.stringify({ error: { code: 'E403', summary: 'forbidden' } });
    assert.equal(parseRegistryLookup({ exitCode: 1, stdout: forbidden, stderr: '' }, '0.9.2').kind, 'error');
  });

  test('a failure with no JSON error body is an error, not absent', () => {
    const lookup = parseRegistryLookup({ exitCode: 1, stdout: '', stderr: 'npm error code ENOTFOUND' }, '0.9.2');
    assert.equal(lookup.kind, 'error');
  });

  test('a successful exit with empty output is an error, not absent', () => {
    assert.equal(parseRegistryLookup({ exitCode: 0, stdout: '', stderr: '' }, '0.9.2').kind, 'error');
  });

  test('a successful answer for a different version is an error', () => {
    assert.equal(parseRegistryLookup({ exitCode: 0, stdout: '"0.9.1"\n', stderr: '' }, '0.9.2').kind, 'error');
  });
});
