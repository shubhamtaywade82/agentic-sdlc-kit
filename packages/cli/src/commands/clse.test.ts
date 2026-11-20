// packages/cli/src/commands/clse.test.ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { installCommand } from './install.js';
import { memoryCommand } from './memory.js';
import { evolveCommand } from './evolve.js';
import type { CommandContext } from './types.js';

const makeCtx = (
  argv: string[],
  cwd: string,
): CommandContext & { out: string[]; err: string[] } => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    argv,
    cwd,
    stdout: (s) => void out.push(s),
    stderr: (s) => void err.push(s),
    out,
    err,
  };
};

describe('installCommand (M15)', () => {
  it('installs kit configuration files and writes ownership manifest', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-install-'));
    try {
      const ctx = makeCtx(['--profile', 'full-sdlc', '--stack', 'node-typescript'], tmp);
      const r = await installCommand.run(ctx);
      expect(r.exitCode).toBe(0);
      expect(ctx.out[0]).toContain('kit install: SUCCESS');
      // Verify files were actually written.
      const projectYml = path.join(tmp, '.ai-kit', 'project.yml');
      const stat = await fs.stat(projectYml);
      expect(stat.isFile()).toBe(true);
      // Verify ownership manifest was written.
      const manifest = path.join(tmp, '.ai-kit', 'ownership-manifest.json');
      const manifestStat = await fs.stat(manifest);
      expect(manifestStat.isFile()).toBe(true);
      // Verify docs directories were created.
      await fs.stat(path.join(tmp, 'docs', 'specifications', '.gitkeep'));
      await fs.stat(path.join(tmp, 'docs', 'plans', '.gitkeep'));
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('supports --dry-run without writing files', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-dryrun-'));
    try {
      const ctx = makeCtx(['--profile', 'minimal', '--dry-run'], tmp);
      const r = await installCommand.run(ctx);
      expect(r.exitCode).toBe(0);
      expect(ctx.out[0]).toContain('dry-run');
      // Verify NO files were written.
      await expect(fs.stat(path.join(tmp, '.ai-kit', 'project.yml'))).rejects.toThrow();
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('memoryCommand (M29)', () => {
  it('reports honestly when no memory has been persisted', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-memory-empty-'));
    try {
      const ctx = makeCtx(['architecture'], tmp);
      const r = await memoryCommand.run(ctx);
      expect(r.exitCode).toBe(0);
      expect(ctx.out[0]).toContain('no memory entries found');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('reads and searches persisted memory entries', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-memory-search-'));
    try {
      // Write a memory file.
      await fs.mkdir(path.join(tmp, '.ai-kit', 'state'), { recursive: true });
      const memory = {
        schemaVersion: 1,
        entries: [
          {
            id: 'MEM-TEST-001',
            type: 'semantic',
            domain: 'architecture',
            summary: 'Modular Monorepo Invariant',
            content: 'Contracts depends on nothing; Core depends only on Contracts.',
            confidence: 1.0,
            provenance: ['ARCHITECTURE.md'],
            appliedCount: 12,
            successCount: 12,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      };
      await fs.writeFile(
        path.join(tmp, '.ai-kit', 'state', 'memory.json'),
        JSON.stringify(memory, null, 2),
        'utf8',
      );

      const ctx = makeCtx(['Monorepo'], tmp);
      const r = await memoryCommand.run(ctx);
      expect(r.exitCode).toBe(0);
      expect(ctx.out[0]).toContain('MEM-TEST-001');
      expect(ctx.out[0]).toContain('Modular Monorepo Invariant');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('evolveCommand (M31-M33)', () => {
  it('reports honestly when no experiences have been persisted', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-evolve-empty-'));
    try {
      const ctx = makeCtx(['--dry-run'], tmp);
      const r = await evolveCommand.run(ctx);
      expect(r.exitCode).toBe(1);
      expect(ctx.out[0]).toContain('no experience records found');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('distills lessons from persisted experiences', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-evolve-real-'));
    try {
      // Write an experiences file with recurring failures.
      await fs.mkdir(path.join(tmp, '.ai-kit', 'state'), { recursive: true });
      const experiences = {
        schemaVersion: 1,
        records: [
          {
            id: 'EXP-1',
            workflowId: 'WF-1',
            featureId: 'FEATURE-A',
            stack: 'node-typescript',
            outcome: 'failure',
            phases: [{ name: 'tdd', status: 'failed', durationMs: 200 }],
            timestamp: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'EXP-2',
            workflowId: 'WF-2',
            featureId: 'FEATURE-B',
            stack: 'node-typescript',
            outcome: 'failure',
            phases: [{ name: 'tdd', status: 'failed', durationMs: 250 }],
            timestamp: '2026-01-01T01:00:00.000Z',
          },
        ],
      };
      await fs.writeFile(
        path.join(tmp, '.ai-kit', 'state', 'experiences.json'),
        JSON.stringify(experiences, null, 2),
        'utf8',
      );

      const ctx = makeCtx(['--dry-run'], tmp);
      const r = await evolveCommand.run(ctx);
      expect(r.exitCode).toBe(0);
      // The output should reference the real distilled data, not demo data.
      expect(ctx.out[0]).toContain('Experiences Loaded: 2');
      expect(ctx.out[0]).toContain('Distilled Lessons:  1');
      // The benchmark environment is not implemented, so the lab must say
      // so instead of reporting COMPLETED with empty numbers (ADR-0018).
      expect(ctx.out[0]).toContain('NOT RUN');
      expect(ctx.out[0]).toContain('0 executed, 1 not run');
      expect(ctx.out[0]).not.toContain('Evolution Lab:      COMPLETED');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
