// packages/cli/src/commands/tier-c-conformance.test.ts
//
// Tier C conformance for the REAL CLI (ADR-0021 §5): every driver
// operation goes through the actual commands — feature, next, journal —
// against a real fixture project. This is the executable proof that
// the kit's own CLI implements the host-driven agent protocol a Tier C
// host (Cursor, AGY, CI) depends on. Any future host adapter runs the
// SAME golden trace through its own driver and must observe the same
// sequence.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scaffoldSpecification, serializeProfileYaml } from '@agentic-sdlc-kit/core';
import type { JournalEvent, NextAction } from '@agentic-sdlc-kit/contracts';
import { runTierCConformanceTrace, type TierCConformanceDriver } from '@agentic-sdlc-kit/testing';
import { featureCommand } from './feature.js';
import { journalCommand } from './journal.js';
import { nextCommand } from './next.js';
import type { CommandContext } from './types.js';

function makeCtx(argv: string[], cwd: string): CommandContext {
  return {
    argv,
    cwd,
    stdout: () => undefined,
    stderr: () => undefined,
  };
}

async function setupProject(): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-tier-c-'));

  await fs.mkdir(path.join(tmp, '.git'), { recursive: true });
  await fs.writeFile(path.join(tmp, '.git', 'HEAD'), 'ref: refs/heads/main\n');

  // Per-task markers: each task's verification fails with a REAL
  // assertion error until ITS OWN marker exists, so a multi-task golden
  // trace can implement tasks one at a time (same shape as the Mode 1
  // orchestration fixture).
  const script = path.join(tmp, 'check.js');
  await fs.writeFile(
    script,
    [
      'const task = process.argv[2];',
      'if (!task) { console.error("AssertionError: missing task argument"); process.exit(1); }',
      'const fs = require("node:fs");',
      'if (!fs.existsSync(".done-" + task)) {',
      '  console.error("AssertionError: expected target for " + task + " to be implemented");',
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
      name: 'tier-c-conformance-app',
      stack: ['node-typescript'],
      commands: {
        test: [
          ['node', 'check.js', 'TASK-001'],
          ['node', 'check.js', 'TASK-002'],
        ],
      },
    }),
  );

  await scaffoldSpecification({
    id: 'FEATURE-001',
    title: 'Tier C Conformance',
    targetDir: path.join(tmp, 'docs', 'specifications', 'features'),
  });

  const planDir = path.join(tmp, 'docs', 'plans', 'FEATURE-001');
  await fs.mkdir(planDir, { recursive: true });
  await fs.writeFile(
    path.join(planDir, 'plan.json'),
    JSON.stringify(
      {
        featureId: 'FEATURE-001',
        tasks: ['TASK-001', 'TASK-002'].map((id) => ({
          id,
          description: `Implement ${id}`,
          acceptanceCriteria: [`${id} works`],
          verification: { command: ['node', 'check.js', id], expectedStatus: 'passed' },
          dependencies: [],
          likelyFiles: [`src/${id}.ts`],
          estimatedScope: 's',
          risk: 'low',
        })),
        edges: [],
        verticalSlices: [['TASK-001'], ['TASK-002']],
      },
      null,
      2,
    ),
  );
  return tmp;
}

/** The CLI driver: every protocol action is a REAL command invocation. */
function cliDriver(root: string): TierCConformanceDriver {
  const runCommand = async (
    command: { run(ctx: CommandContext): Promise<{ exitCode: number; message?: string }> },
    argv: string[],
  ): Promise<{ ok: boolean; message?: string }> => {
    const result = await command.run(makeCtx(argv, root));
    return result.exitCode === 0
      ? { ok: true }
      : { ok: false, message: result.message ?? `exit ${result.exitCode}` };
  };

  return {
    start: (featureId) => runCommand(featureCommand, [featureId, 'start']),
    async next(featureId) {
      const out: string[] = [];
      const result = await nextCommand.run({
        argv: [featureId, '--json'],
        cwd: root,
        stdout: (s) => void out.push(s),
        stderr: () => undefined,
      });
      expect(result.exitCode).toBe(0);
      return JSON.parse(out.join('')) as NextAction;
    },
    runPhase: (featureId, taskId, phase) =>
      runCommand(featureCommand, [featureId, phase, taskId, '--host', 'conformance-test']),
    verify: (featureId) => runCommand(featureCommand, [featureId, 'verify']),
    async journal(featureId) {
      const out: string[] = [];
      const result = await journalCommand.run({
        argv: [featureId, '--json'],
        cwd: root,
        stdout: (s) => void out.push(s),
        stderr: () => undefined,
      });
      expect(result.exitCode).toBe(0);
      return JSON.parse(out.join('')) as JournalEvent[];
    },
    async verifyJournal(featureId) {
      const out: string[] = [];
      const result = await journalCommand.run({
        argv: [featureId, '--verify', '--json'],
        cwd: root,
        stdout: (s) => void out.push(s),
        stderr: () => undefined,
      });
      const parsed = JSON.parse(out.join('')) as {
        valid: boolean;
        eventCount: number;
      };
      return { ...parsed, ...(result.exitCode !== 0 ? { reason: 'verify command failed' } : {}) };
    },
    async applyImplementation(_featureId: string, taskId: string) {
      // The fixture's "implementation" is the task's marker file — exactly
      // where a real host's code edits would land between phases.
      await fs.writeFile(path.join(root, `.done-${taskId}`), 'implemented\n', 'utf8');
    },
  };
}

describe('Tier C conformance: the real CLI drives the golden trace', () => {
  it('passes the full golden trace for a two-task feature', async () => {
    const root = await setupProject();
    const report = await runTierCConformanceTrace(cliDriver(root), {
      featureId: 'FEATURE-001',
      taskIds: ['TASK-001', 'TASK-002'],
    });
    const failures = report.steps.filter((s) => !s.passed);
    expect(failures).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it('records the host declaration in the journal actor for phase events', async () => {
    const root = await setupProject();
    const report = await runTierCConformanceTrace(cliDriver(root), {
      featureId: 'FEATURE-001',
      taskIds: ['TASK-001', 'TASK-002'],
    });
    expect(report.passed).toBe(true);
    const driver = cliDriver(root);
    const events = await driver.journal('FEATURE-001');
    const phaseEvents = events.filter((e) => e.kind.startsWith('phase.'));
    expect(phaseEvents.length).toBeGreaterThan(0);
    for (const event of phaseEvents) {
      expect(event.actor).toEqual({ kind: 'agent', host: 'conformance-test' });
    }
  });
});
