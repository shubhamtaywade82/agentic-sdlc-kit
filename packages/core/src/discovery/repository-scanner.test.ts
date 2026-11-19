// packages/core/src/discovery/repository-scanner.test.ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileSystemRepositoryScanner, StubRepositoryScanner } from './repository-scanner.js';

const FIXTURE_ROOT = path.resolve(
  new URL('../../../../fixtures/fixture-node-fullstack', import.meta.url).pathname,
);

const REPO_ROOT = path.resolve(new URL('../../../..', import.meta.url).pathname);

describe('StubRepositoryScanner', () => {
  it('returns NOT_IMPLEMENTED', async () => {
    const s = new StubRepositoryScanner();
    const r = await s.scan('/some/root');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('NOT_IMPLEMENTED');
      expect(r.error.details).toMatchObject({ milestone: 'M2' });
    }
  });
});

describe('FileSystemRepositoryScanner', () => {
  it('scans fixture-node-fullstack correctly', async () => {
    const scanner = new FileSystemRepositoryScanner();
    const res = await scanner.scan(FIXTURE_ROOT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const scan = res.value;
    // fixture-node-fullstack is a plain Node.js project (no TypeScript),
    // so the detector should label it 'node', not 'node-typescript'.
    expect(scan.detectedStacks).toContain('node');
    expect(scan.testFrameworks).toContain('node:test');
    expect(scan.agentInstructionFiles).toContain('AGENTS.md');
    expect(scan.entryPoints).toContain('src/index.js');
    expect(scan.hasMigrations).toBe(false);
    expect(scan.hasCi).toBe(false);
    expect(scan.git.headSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('returns DISCOVERY_FAILED for non-existent path', async () => {
    const scanner = new FileSystemRepositoryScanner();
    const res = await scanner.scan('/non/existent/path/xyz-123');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('DISCOVERY_FAILED');
    }
  });

  it('scans current repository detecting pnpm, CI, and agent instructions', async () => {
    const scanner = new FileSystemRepositoryScanner();
    const res = await scanner.scan(REPO_ROOT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const scan = res.value;
    expect(scan.detectedStacks).toContain('node-typescript');
    expect(scan.packageManagers).toContain('pnpm');
    expect(scan.hasCi).toBe(true);
    expect(scan.agentInstructionFiles).toContain('AGENTS.md');
    expect(scan.agentInstructionFiles).toContain('GEMINI.md');
    expect(scan.git.branch.length).toBeGreaterThan(0);
    expect(scan.git.headSha).toMatch(/^[0-9a-f]{40}$/);
  });
});
