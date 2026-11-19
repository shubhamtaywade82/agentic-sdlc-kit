// packages/cli/src/commands/validate-plan.test.ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validatePlanCommand } from './validate-plan.js';
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

describe('validatePlanCommand', () => {
  it('shows help when --help is passed', async () => {
    const ctx = makeCtx(['--help'], '/');
    const r = await validatePlanCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    expect(ctx.out[0]).toContain('Usage: kit validate-plan');
  });

  it('validates a valid implementation plan', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-plan-'));
    try {
      const planFile = path.join(tmp, 'plan.json');
      const plan = {
        featureId: 'FEATURE-001',
        tasks: [
          {
            id: 'TASK-001',
            description: 'Build domain logic',
            acceptanceCriteria: ['Valid behavior'],
            verification: { command: ['npm', 'test'], expectedStatus: 'passed' },
            dependencies: [],
            likelyFiles: ['src/index.ts'],
            estimatedScope: 's',
            risk: 'low',
          },
        ],
        edges: [],
        verticalSlices: [['TASK-001']],
      };
      await fs.writeFile(planFile, JSON.stringify(plan, null, 2), 'utf8');

      const ctx = makeCtx([planFile], tmp);
      const r = await validatePlanCommand.run(ctx);
      expect(r.exitCode).toBe(0);
      expect(ctx.out[0]).toContain('kit validate-plan: PASS');
      expect(ctx.out[0]).toContain('FEATURE-001');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('fails when plan has dependency cycle', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-plan-cycle-'));
    try {
      const planFile = path.join(tmp, 'plan.json');
      const plan = {
        featureId: 'FEATURE-001',
        tasks: [
          {
            id: 'TASK-001',
            description: 'Task A',
            acceptanceCriteria: ['OK'],
            verification: { command: ['npm', 'test'], expectedStatus: 'passed' },
            dependencies: ['TASK-002'],
            likelyFiles: [],
            estimatedScope: 's',
            risk: 'low',
          },
          {
            id: 'TASK-002',
            description: 'Task B',
            acceptanceCriteria: ['OK'],
            verification: { command: ['npm', 'test'], expectedStatus: 'passed' },
            dependencies: ['TASK-001'],
            likelyFiles: [],
            estimatedScope: 's',
            risk: 'low',
          },
        ],
        edges: [],
        verticalSlices: [['TASK-001', 'TASK-002']],
      };
      await fs.writeFile(planFile, JSON.stringify(plan, null, 2), 'utf8');

      const ctx = makeCtx([planFile], tmp);
      const r = await validatePlanCommand.run(ctx);
      expect(r.exitCode).toBe(1);
      expect(ctx.err[0]).toContain('Dependency cycle detected');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
