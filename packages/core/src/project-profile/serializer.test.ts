// packages/core/src/project-profile/serializer.test.ts
import { describe, expect, it } from 'vitest';
import type { ProjectProfile } from '@agentic-sdlc-kit/contracts';
import { parseProfileFromYaml, serializeProfileToYaml } from './serializer.js';

const sampleProfile: ProjectProfile = {
  schemaVersion: 1,
  name: 'sample-app',
  stack: ['node-typescript'],
  commands: {
    test: [['pnpm', 'test']],
    build: [['pnpm', 'build']],
  },
};

describe('serializeProfileToYaml', () => {
  it('serializes profile with commands correctly (prettier-stable quoting)', () => {
    const yaml = serializeProfileToYaml(sampleProfile);
    expect(yaml).toContain('schemaVersion: 1');
    expect(yaml).toContain('name: sample-app');
    expect(yaml).toContain('  - node-typescript');
    expect(yaml).toContain("    - ['pnpm', 'test']");
    expect(yaml).toContain("    - ['pnpm', 'build']");
  });

  it('serializes profile with empty commands', () => {
    const yaml = serializeProfileToYaml({
      schemaVersion: 1,
      name: 'empty-commands',
      stack: ['python'],
      commands: {},
    });
    expect(yaml).toContain('commands: {}');
  });

  it('round-trips through the parser', () => {
    const res = parseProfileFromYaml(serializeProfileToYaml(sampleProfile));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual(sampleProfile);
  });
});

describe('parseProfileFromYaml', () => {
  it('parses the committed fixture profile (prettier single-quoted arrays)', async () => {
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const fixturePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../../fixtures/fixture-node-fullstack/.ai-kit/project.yml',
    );
    const yaml = await fs.readFile(fixturePath, 'utf8');
    const res = parseProfileFromYaml(yaml);
    expect(res.ok).toBe(true);
    if (res.ok) {
      // Regression guard: this fixture previously parsed to `test: []`
      // because the parser silently dropped single-quoted flow arrays,
      // which made `kit verify` report BLOCKED with zero checks.
      expect(res.value.commands.test).toEqual([['node', '--test']]);
    }
  });

  it('parses double-quoted JSON-style arrays', () => {
    const res = parseProfileFromYaml(
      [
        'schemaVersion: 1',
        'name: x',
        'stack: [node]',
        'commands:',
        '  test:',
        '    - ["node", "--test"]',
      ].join('\n'),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.commands.test).toEqual([['node', '--test']]);
  });

  it('parses flow-style category values', () => {
    const res = parseProfileFromYaml(
      [
        'schemaVersion: 1',
        'name: x',
        'stack:',
        '  - node',
        'commands:',
        "  test: ['node', '--test']",
      ].join('\n'),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.commands.test).toEqual([['node', '--test']]);
  });

  it('parses plain scalar commands into argv arrays', () => {
    const res = parseProfileFromYaml(
      [
        'schemaVersion: 1',
        'name: x',
        'stack:',
        '  - node',
        'commands:',
        '  test:',
        '    - node --test',
      ].join('\n'),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.commands.test).toEqual([['node', '--test']]);
  });

  it('rejects an empty command array with a line number instead of dropping it', () => {
    const res = parseProfileFromYaml(
      [
        'schemaVersion: 1',
        'name: x',
        'stack:',
        '  - node',
        'commands:',
        '  test:',
        '    - []',
      ].join('\n'),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('line 7');
  });

  it('rejects unknown top-level keys (e.g. a typo like "command:")', () => {
    const res = parseProfileFromYaml(
      ['schemaVersion: 1', 'name: x', 'stack:', '  - node', 'command: {}'].join('\n'),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('unsupported key "command"');
  });

  it('rejects unknown command categories', () => {
    const res = parseProfileFromYaml(
      [
        'schemaVersion: 1',
        'name: x',
        'stack:',
        '  - node',
        'commands:',
        '  deploy:',
        '    - ["sh", "x.sh"]',
      ].join('\n'),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('unknown command category "deploy"');
  });

  it('rejects garbage under commands: instead of silently ignoring it', () => {
    const res = parseProfileFromYaml(
      [
        'schemaVersion: 1',
        'name: x',
        'stack:',
        '  - node',
        'commands:',
        '  test:',
        '    - node --test',
        '    ???',
      ].join('\n'),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('line 8');
  });

  it('rejects a placeholder profile with an empty name (no silent default)', () => {
    const res = parseProfileFromYaml(
      ['schemaVersion: 1', 'name: ""', 'stack: []', 'commands: {}'].join('\n'),
    );
    expect(res.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verification.strength section (ADR-0022): strict parse, round-trip, and
// hard errors on typos — a misconfigured strength gate is never silent.
// ---------------------------------------------------------------------------

const strengthProfile: ProjectProfile = {
  schemaVersion: 1,
  name: 'strength-app',
  stack: ['node-typescript'],
  commands: { test: [['node', '--test']] },
  verification: {
    strength: {
      enabled: true,
      threshold: 60,
      budgetMs: 300_000,
      scope: 'diff',
      gateMode: 'enforce',
    },
  },
};

describe('verification.strength (ADR-0022)', () => {
  it('round-trips through serialize → parse', () => {
    const res = parseProfileFromYaml(serializeProfileToYaml(strengthProfile));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual(strengthProfile);
  });

  it('parses the documented hand-written form with comments', () => {
    const res = parseProfileFromYaml(
      [
        'schemaVersion: 1',
        'name: hand-written',
        'stack:',
        '  - node-typescript',
        'commands:',
        '  test:',
        "    - ['node', '--test']",
        'verification:',
        '  strength:',
        '    enabled: true   # opt-in',
        '    threshold: 60',
        '    budgetMs: 300000',
        '    scope: diff',
        '    gateMode: warn',
      ].join('\n'),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.verification?.strength).toEqual({
        enabled: true,
        threshold: 60,
        budgetMs: 300_000,
        scope: 'diff',
        gateMode: 'warn',
      });
    }
  });

  it('keeps profiles without the section byte-identical in behavior (optional)', () => {
    const res = parseProfileFromYaml(serializeProfileToYaml(sampleProfile));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.verification).toBeUndefined();
  });

  it('hard-errors on an unknown strength key (fail closed, with line number)', () => {
    const res = parseProfileFromYaml(
      [
        'schemaVersion: 1',
        'name: typo',
        'stack: [node-typescript]',
        'commands: {}',
        'verification:',
        '  strength:',
        '    enabled: true',
        '    threshold: 60',
        '    budgetMs: 300000',
        '    scope: diff',
        '    gateMode: warn',
        '    gate_mode: enforce',
      ].join('\n'),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('gate_mode');
  });

  it('hard-errors on an invalid enum value', () => {
    const res = parseProfileFromYaml(
      [
        'schemaVersion: 1',
        'name: typo',
        'stack: [node-typescript]',
        'commands: {}',
        'verification:',
        '  strength:',
        '    enabled: maybe',
        '    threshold: 60',
        '    budgetMs: 300000',
        '    scope: diff',
        '    gateMode: warn',
      ].join('\n'),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('enabled');
  });
});
