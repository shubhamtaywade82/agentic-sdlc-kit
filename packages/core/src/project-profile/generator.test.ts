// packages/core/src/project-profile/generator.test.ts
import { describe, expect, it } from 'vitest';
import { generateProfile } from './generator.js';
import type { RepositoryScan } from '@agentic-sdlc-kit/contracts';

const baseScan = (overrides: Partial<RepositoryScan> = {}): RepositoryScan => ({
  root: '/repo/fixture-node-fullstack',
  detectedStacks: ['node-typescript'],
  packageManagers: ['pnpm'],
  entryPoints: ['src/index.ts'],
  testFrameworks: ['vitest'],
  hasMigrations: false,
  hasCi: true,
  agentInstructionFiles: [],
  git: { branch: 'main', dirty: false, headSha: '0'.repeat(40) },
  ...overrides,
});

describe('generateProfile', () => {
  it('generates a valid profile for a node-typescript scan', () => {
    const r = generateProfile(baseScan());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe('fixture-node-fullstack');
      expect(r.value.stack).toEqual(['node-typescript']);
      expect(r.value.commands.test).toEqual([['pnpm', 'test']]);
      expect(r.value.commands.build).toEqual([['pnpm', 'build']]);
      expect(r.value.schemaVersion).toBe(1);
    }
  });

  it('returns DISCOVERY_FAILED when no stacks are detected', () => {
    const r = generateProfile(baseScan({ detectedStacks: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('DISCOVERY_FAILED');
  });

  it('derives the project name from the root path', () => {
    const r = generateProfile(baseScan({ root: '/home/user/My-Cool_App/' }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe('my-cool-app');
  });

  it('generates node:test command when node:test is detected', () => {
    const r = generateProfile(baseScan({ testFrameworks: ['node:test'] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.commands.test).toEqual([['node', '--test']]);
    }
  });

  it('handles unknown primary stack by producing an empty commands map (still valid)', () => {
    const r = generateProfile(baseScan({ detectedStacks: ['unknown-stack'] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.commands).toEqual({});
  });

  it('never throws on malformed input shape (scan is well-formed but weird)', () => {
    const weird = baseScan({ root: '/' });
    const r = generateProfile(weird);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe('unnamed-project');
  });
});
