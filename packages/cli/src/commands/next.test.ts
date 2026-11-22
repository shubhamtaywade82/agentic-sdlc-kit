// packages/cli/src/commands/next.test.ts
//
// Tests for `kit next` and `kit journal` (ADR-0021): the host-driven
// agent protocol entry point and its tamper-evident record.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scaffoldSpecification, serializeProfileYaml } from '@agentic-sdlc-kit/core';
import type { NextAction } from '@agentic-sdlc-kit/contracts';
import { featureCommand } from './feature.js';
import { journalCommand } from './journal.js';
import { nextCommand } from './next.js';
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

async function setupProject(featureIds: readonly string[] = ['FEATURE-001']): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-next-'));
  const marker = path.join(tmp, '.done');

  await fs.mkdir(path.join(tmp, '.git'), { recursive: true });
  await fs.writeFile(path.join(tmp, '.git', 'HEAD'), 'ref: refs/heads/main\n');

  const script = path.join(tmp, 'check.js');
  await fs.writeFile(
    script,
    [
      'const fs = require("node:fs");',
      `const marker = ${JSON.stringify(marker)};`,
      'if (!fs.existsSync(marker)) {',
      '  console.error("AssertionError: expected marker to exist (target not implemented)");',
      '  process.exit(1);',
      '}',
      'process.exit(0);',
    ].join('\n'),
  );

  const aiKit = path.join(tmp, '.ai-kit');
  await fs.mkdir(aiKit, { recursive: true });
  await fs.writeFile(
    path.join(aiKit, 'project.yml'),
    serializeProfileYaml({
      schemaVersion: 1,
      name: 'cli-next-app',
      stack: ['node-typescript'],
      commands: { test: [['node', script]] },
    }),
  );

  for (const featureId of featureIds) {
    await scaffoldSpecification({
      id: featureId,
      title: `Feature ${featureId}`,
      targetDir: path.join(tmp, 'docs', 'specifications', 'features'),
    });
    const planDir = path.join(tmp, 'docs', 'plans', featureId);
    await fs.mkdir(planDir, { recursive: true });
    await fs.writeFile(
      path.join(planDir, 'plan.json'),
      JSON.stringify(
        {
          featureId,
          tasks: [
            {
              id: 'TASK-001',
              description: 'Implement TASK-001',
              acceptanceCriteria: ['TASK-001 works'],
              verification: { command: ['node', script], expectedStatus: 'passed' },
              dependencies: [],
              likelyFiles: ['src/TASK-001.ts'],
              estimatedScope: 's',
              risk: 'low',
            },
          ],
          edges: [],
          verticalSlices: [['TASK-001']],
        },
        null,
        2,
      ),
    );
  }
  return tmp;
}

describe('kit next', () => {
  it('is blocked (exit 3) when no feature run exists', async () => {
    const root = await setupProject();
    const ctx = makeCtx([], root);
    const result = await nextCommand.run(ctx);
    expect(result.exitCode).toBe(3);
    expect(ctx.err.join('')).toContain('no active feature runs');
  });

  it('resolves the single active run and reports task.red as JSON', async () => {
    const root = await setupProject();
    await featureCommand.run(makeCtx(['FEATURE-001', 'start'], root));

    const ctx = makeCtx(['--json'], root);
    const result = await nextCommand.run(ctx);
    expect(result.exitCode).toBe(0);
    const action = JSON.parse(ctx.out.join('')) as NextAction;
    expect(action.schemaVersion).toBe(1);
    expect(action.featureId).toBe('FEATURE-001');
    expect(action.requiredAction).toBe('task.red');
    expect(action.taskId).toBe('TASK-001');
    expect(action.verificationCommand[0]).toBe('node');
    expect(action.nextInvocation).toBe('kit feature FEATURE-001 red TASK-001');
  });

  it('prints a human-readable next invocation without --json', async () => {
    const root = await setupProject();
    await featureCommand.run(makeCtx(['FEATURE-001', 'start'], root));
    const ctx = makeCtx([], root);
    const result = await nextCommand.run(ctx);
    expect(result.exitCode).toBe(0);
    expect(ctx.out.join('')).toContain('kit feature FEATURE-001 red TASK-001');
  });

  it('is blocked (exit 3) when multiple runs are active and no id is given', async () => {
    const root = await setupProject(['FEATURE-001', 'FEATURE-002']);
    await featureCommand.run(makeCtx(['FEATURE-001', 'start'], root));
    await featureCommand.run(makeCtx(['FEATURE-002', 'start'], root));

    const ctx = makeCtx([], root);
    const result = await nextCommand.run(ctx);
    expect(result.exitCode).toBe(3);
    expect(ctx.err.join('')).toContain('multiple active feature runs');
  });

  it('follows the protocol forward: red -> green after the red phase records', async () => {
    const root = await setupProject();
    await featureCommand.run(makeCtx(['FEATURE-001', 'start'], root));
    await featureCommand.run(makeCtx(['FEATURE-001', 'red', 'TASK-001'], root));

    const ctx = makeCtx(['--json'], root);
    await nextCommand.run(ctx);
    const action = JSON.parse(ctx.out.join('')) as NextAction;
    expect(action.requiredAction).toBe('task.green');
  });

  it('reports feature.verify once every task completed, then run.completed after a passed verify', async () => {
    const root = await setupProject();
    await featureCommand.run(makeCtx(['FEATURE-001', 'start'], root));
    await featureCommand.run(makeCtx(['FEATURE-001', 'red', 'TASK-001'], root));
    await fs.writeFile(path.join(root, '.done'), 'implemented\n', 'utf8');
    await featureCommand.run(makeCtx(['FEATURE-001', 'green', 'TASK-001'], root));
    await featureCommand.run(makeCtx(['FEATURE-001', 'refactor', 'TASK-001'], root));

    const before = makeCtx(['--json'], root);
    await nextCommand.run(before);
    expect((JSON.parse(before.out.join('')) as NextAction).requiredAction).toBe('feature.verify');

    const verify = await featureCommand.run(makeCtx(['FEATURE-001', 'verify'], root));
    expect(verify.exitCode).toBe(0);

    const after = makeCtx(['--json'], root);
    await nextCommand.run(after);
    const completed = JSON.parse(after.out.join('')) as NextAction;
    expect(completed.requiredAction).toBe('run.completed');
    expect(completed.status).toBe('completed');
  });
});

describe('kit journal', () => {
  it('lists the events of a driven run in human form', async () => {
    const root = await setupProject();
    await featureCommand.run(makeCtx(['FEATURE-001', 'start'], root));
    await featureCommand.run(makeCtx(['FEATURE-001', 'red', 'TASK-001'], root));

    const ctx = makeCtx(['FEATURE-001'], root);
    const result = await journalCommand.run(ctx);
    expect(result.exitCode).toBe(0);
    const text = ctx.out.join('');
    expect(text).toContain('workflow.started');
    expect(text).toContain('phase.recorded');
  });

  it('emits machine-readable events with --json', async () => {
    const root = await setupProject();
    await featureCommand.run(makeCtx(['FEATURE-001', 'start', '--host', 'cursor'], root));

    const ctx = makeCtx(['FEATURE-001', '--json'], root);
    await journalCommand.run(ctx);
    const events = JSON.parse(ctx.out.join('')) as Array<{
      kind: string;
      actor: { kind: string; host?: string };
    }>;
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('workflow.started');
    expect(events[0]?.actor).toEqual({ kind: 'agent', host: 'cursor' });
  });

  it('verifies an intact chain (exit 0)', async () => {
    const root = await setupProject();
    await featureCommand.run(makeCtx(['FEATURE-001', 'start'], root));
    const ctx = makeCtx(['FEATURE-001', '--verify'], root);
    const result = await journalCommand.run(ctx);
    expect(result.exitCode).toBe(0);
    expect(ctx.out.join('')).toContain('Journal verified');
  });

  it('fails (exit 1) when the chain was tampered with', async () => {
    const root = await setupProject();
    await featureCommand.run(makeCtx(['FEATURE-001', 'start'], root));

    const file = path.join(root, '.ai-kit', 'journal', 'feature-runs', 'FEATURE-001.jsonl');
    const lines = (await fs.readFile(file, 'utf8')).split('\n').filter((l) => l.trim());
    const event = JSON.parse(lines[0] ?? '{}') as { payload: Record<string, unknown> };
    event.payload['taskCount'] = 999;
    lines[0] = JSON.stringify(event);
    await fs.writeFile(file, `${lines.join('\n')}\n`, 'utf8');

    const ctx = makeCtx(['FEATURE-001', '--verify'], root);
    const result = await journalCommand.run(ctx);
    expect(result.exitCode).toBe(1);
    expect(ctx.err.join('')).toContain('chain violation');
  });

  it('fails when the journal does not exist', async () => {
    const root = await setupProject();
    const ctx = makeCtx(['FEATURE-404', '--verify'], root);
    const result = await journalCommand.run(ctx);
    expect(result.exitCode).toBe(1);
  });
});
