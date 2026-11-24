// packages/cli/src/commands/fix.test.ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldSpecification, serializeProfileYaml } from '@agentic-sdlc-kit/core';
import { fixCommand } from './fix.js';
import type { CommandContext } from './types.js';

const makeCtx = (
  argv: string[],
  cwd: string,
): CommandContext & { out: string[]; err: string[] } => {
  const out: string[] = [];
  const err: string[] = [];
  return { argv, cwd, stdout: (s) => void out.push(s), stderr: (s) => void err.push(s), out, err };
};

let root: string;
let marker: string;

/** The test script fails with a real AssertionError until the marker (the "fix") exists. */
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-fix-'));
  marker = path.join(root, '.fixed');
  const script = path.join(root, 'check.js');
  await fs.writeFile(
    script,
    [
      'const fs = require("node:fs");',
      `if (!fs.existsSync(${JSON.stringify(marker)})) {`,
      '  console.error("AssertionError: expected defect to be fixed");',
      '  process.exit(1);',
      '}',
    ].join('\n'),
  );
  await fs.mkdir(path.join(root, '.ai-kit'), { recursive: true });
  await fs.writeFile(
    path.join(root, '.ai-kit', 'project.yml'),
    serializeProfileYaml({
      schemaVersion: 1,
      name: 'fix-app',
      stack: ['node-typescript'],
      commands: { test: [['node', script]] },
    }),
  );
  await scaffoldSpecification({
    id: 'BUG-101',
    title: 'Transfer accepts negative amounts',
    targetDir: path.join(root, 'docs', 'specifications', 'features'),
  });
  const planDir = path.join(root, 'docs', 'plans', 'BUG-101');
  await fs.mkdir(planDir, { recursive: true });
  await fs.writeFile(
    path.join(planDir, 'plan.json'),
    JSON.stringify({
      featureId: 'BUG-101',
      tasks: [
        {
          id: 'TASK-001',
          description: 'Reject negative transfer amounts',
          acceptanceCriteria: ['negative amount is rejected'],
          verification: { command: ['node', script], expectedStatus: 'passed' },
          dependencies: [],
          likelyFiles: ['src/transfer.js'],
          estimatedScope: 'xs',
          risk: 'low',
        },
      ],
      edges: [],
      verticalSlices: [['TASK-001']],
    }),
  );
});
afterEach(() => fs.rm(root, { recursive: true, force: true }));

describe('fixCommand', () => {
  it('shows help when --help is passed', async () => {
    const ctx = makeCtx(['--help'], '/');
    expect((await fixCommand.run(ctx)).exitCode).toBe(0);
    expect(ctx.out[0]).toContain('Usage: kit fix');
  });

  it('fails if issue ID is missing', async () => {
    const ctx = makeCtx([], '/');
    expect((await fixCommand.run(ctx)).exitCode).toBe(1);
    expect(ctx.err[0]).toContain('missing required issue identifier');
  });

  it('no longer reports success without a failing test: green before red is rejected', async () => {
    expect((await fixCommand.run(makeCtx(['BUG-101', 'start'], root))).exitCode).toBe(0);
    await fs.writeFile(marker, 'fixed'); // the defect is "fixed" but Red was never observed
    const green = makeCtx(['BUG-101', 'green', 'TASK-001'], root);
    expect((await fixCommand.run(green)).exitCode).toBe(1);
    expect(green.err.join('\n')).toMatch(/red/i);
  });

  it('drives red -> green -> refactor -> verify with recorded evidence', async () => {
    expect((await fixCommand.run(makeCtx(['BUG-101', 'start'], root))).exitCode).toBe(0);
    expect((await fixCommand.run(makeCtx(['BUG-101', 'red', 'TASK-001'], root))).exitCode).toBe(0);
    await fs.writeFile(marker, 'fixed');
    expect((await fixCommand.run(makeCtx(['BUG-101', 'green', 'TASK-001'], root))).exitCode).toBe(0);
    expect((await fixCommand.run(makeCtx(['BUG-101', 'refactor', 'TASK-001'], root))).exitCode).toBe(0);
    const verify = makeCtx(['BUG-101', 'verify'], root);
    expect((await fixCommand.run(verify)).exitCode).toBe(0);
    expect(verify.out.join('\n')).toContain('red:failed green:passed refactor:passed');
    const journal = await fs.readdir(path.join(root, '.ai-kit', 'journal', 'feature-runs'));
    expect(journal).toContain('BUG-101.jsonl');
  });

  it('with no action it starts the run, then reports status', async () => {
    const first = makeCtx(['BUG-101'], root);
    expect((await fixCommand.run(first)).exitCode).toBe(0);
    const again = makeCtx(['BUG-101'], root);
    expect((await fixCommand.run(again)).exitCode).toBe(0);
    expect(again.out.join('\n')).toContain('BUG-101');
  });
});
