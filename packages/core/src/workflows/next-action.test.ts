// packages/core/src/workflows/next-action.test.ts
//
// Tests for computeNextAction / listFeatureRunStates (ADR-0021 §2):
// every protocol state must be derived honestly from persisted state
// and the plan — no guessing, fail closed on divergence.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializeProfileYaml } from '../project-profile/serializer.js';
import { scaffoldSpecification } from '../specification/scaffolder.js';
import { computeNextAction, listFeatureRunStates } from './next-action.js';
import { runTddPhase, startFeatureRun } from './feature-workflow.js';
import { featureRunPath } from './tdd-run-store.js';
import { readJournal, verifyJournal } from './journal.js';
import { recordNextOffer } from './decision-trace.js';

interface TestProject {
  readonly root: string;
  readonly marker: string;
  readonly checkScript: string;
}

/** Same fixture shape as feature-workflow.test.ts: a task verification
 * script that fails with a REAL assertion error until a marker exists. */
async function setupProject(
  failureOutput = 'AssertionError: expected marker to exist (target not implemented)',
): Promise<TestProject> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-next-action-'));
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
      '  console.error(' + JSON.stringify(failureOutput) + ');',
      '  process.exit(1);',
      '}',
      'process.exit(0);',
    ].join('\n'),
  );

  const aiKitDir = path.join(tmp, '.ai-kit');
  await fs.mkdir(aiKitDir, { recursive: true });
  await fs.writeFile(
    path.join(aiKitDir, 'project.yml'),
    serializeProfileYaml({
      schemaVersion: 1,
      name: 'test-next-action',
      stack: ['node-typescript'],
      commands: { test: [['node', script]] },
    }),
  );

  await scaffoldSpecification({
    id: 'FEATURE-001',
    title: 'Next Action Protocol',
    targetDir: path.join(tmp, 'docs', 'specifications', 'features'),
  });

  const planDir = path.join(tmp, 'docs', 'plans', 'FEATURE-001');
  await fs.mkdir(planDir, { recursive: true });
  await fs.writeFile(
    path.join(planDir, 'plan.json'),
    JSON.stringify(
      {
        featureId: 'FEATURE-001',
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

  return { root: tmp, marker, checkScript: script };
}

async function completeTask(project: TestProject, taskId: string): Promise<void> {
  const opts = { featureId: 'FEATURE-001', projectRoot: project.root, taskId } as const;
  await runTddPhase({ ...opts, phase: 'red' }); // fails at an assertion (marker absent)
  await fs.writeFile(project.marker, 'implemented\n', 'utf8');
  await runTddPhase({ ...opts, phase: 'green' });
  await runTddPhase({ ...opts, phase: 'refactor' });
}

describe('computeNextAction', () => {
  it('reports feature.start when no run state exists', async () => {
    const project = await setupProject();
    const res = await computeNextAction({
      projectRoot: project.root,
      featureId: 'FEATURE-001',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.requiredAction).toBe('feature.start');
    expect(res.value.status).toBe('pending');
    expect(res.value.nextInvocation).toBe('kit feature FEATURE-001 start');
    expect(res.value.verificationCommand).toEqual([]);
  });

  it('reports task.red with the task verification command after start', async () => {
    const project = await setupProject();
    await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: project.root });
    const res = await computeNextAction({
      projectRoot: project.root,
      featureId: 'FEATURE-001',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.requiredAction).toBe('task.red');
    expect(res.value.taskId).toBe('TASK-001');
    expect(res.value.phase).toBe('red');
    expect(res.value.verificationCommand).toEqual(['node', project.checkScript]);
    expect(res.value.nextInvocation).toBe('kit feature FEATURE-001 red TASK-001');
    expect(res.value.status).toBe('in_progress');
    expect(res.value.blockingQuestions).toEqual([]);
    expect(res.value.advisoryLessons).toEqual([]);
    expect(res.value.constraints.timeoutMs).toBeGreaterThan(0);
  });

  it('advances through green and refactor as phases complete', async () => {
    const project = await setupProject();
    await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: project.root });
    await runTddPhase({
      featureId: 'FEATURE-001',
      projectRoot: project.root,
      taskId: 'TASK-001',
      phase: 'red',
    });

    const afterRed = await computeNextAction({
      projectRoot: project.root,
      featureId: 'FEATURE-001',
    });
    expect(afterRed.ok && afterRed.value.requiredAction).toBe('task.green');

    await fs.writeFile(project.marker, 'implemented\n', 'utf8');
    await runTddPhase({
      featureId: 'FEATURE-001',
      projectRoot: project.root,
      taskId: 'TASK-001',
      phase: 'green',
    });
    const afterGreen = await computeNextAction({
      projectRoot: project.root,
      featureId: 'FEATURE-001',
    });
    expect(afterGreen.ok && afterGreen.value.requiredAction).toBe('task.refactor');
  });

  it('reports feature.verify when all tasks are complete but no passed finalize is journaled', async () => {
    const project = await setupProject();
    await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: project.root });
    await completeTask(project, 'TASK-001');
    const res = await computeNextAction({
      projectRoot: project.root,
      featureId: 'FEATURE-001',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.requiredAction).toBe('feature.verify');
    expect(res.value.nextInvocation).toBe('kit feature FEATURE-001 verify');
  });

  it('fails closed (not feature.start) when the state file is corrupt', async () => {
    const project = await setupProject();
    await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: project.root });
    await fs.writeFile(
      featureRunPath(project.root, 'FEATURE-001'),
      '{"schemaVersion": 99, "tasks": null}',
      'utf8',
    );
    const res = await computeNextAction({
      projectRoot: project.root,
      featureId: 'FEATURE-001',
    });
    expect(res.ok).toBe(false);
  });
});

describe('listFeatureRunStates', () => {
  it('returns nothing for a project with no runs', async () => {
    const project = await setupProject();
    expect(await listFeatureRunStates(project.root)).toEqual([]);
  });

  it('lists active runs and skips unreadable state files', async () => {
    const project = await setupProject();
    await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: project.root });
    const runs = await listFeatureRunStates(project.root);
    expect(runs.map((r) => r.featureId)).toEqual(['FEATURE-001']);

    // A corrupt second run must be skipped, not crash the scan.
    const corruptDir = path.dirname(featureRunPath(project.root, 'FEATURE-001'));
    await fs.writeFile(path.join(corruptDir, 'FEATURE-002.json'), '{not json', 'utf8');
    const withCorrupt = await listFeatureRunStates(project.root);
    expect(withCorrupt.map((r) => r.featureId)).toEqual(['FEATURE-001']);
  });
});

describe('computeNextAction: recovery hint and advertised timeout (item 1)', () => {
  const COMPILE_ERROR = "src/feature.ts:12:5 - error TS2304: Cannot find name 'missing'.";
  const red = { featureId: 'FEATURE-001', taskId: 'TASK-001', phase: 'red' as const };

  it('has no hint before any attempt has been rejected', async () => {
    const project = await setupProject();
    await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: project.root });
    const res = await computeNextAction({ projectRoot: project.root, featureId: 'FEATURE-001' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.recoveryHint).toBeUndefined();
  });

  it('feeds a rejected red compilation back as a recovery hint', async () => {
    const project = await setupProject(COMPILE_ERROR);
    await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: project.root });
    const rejected = await runTddPhase({ ...red, projectRoot: project.root });
    expect(rejected.ok).toBe(false);
    const res = await computeNextAction({ projectRoot: project.root, featureId: 'FEATURE-001' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.requiredAction).toBe('task.red');
    expect(res.value.recoveryHint).toMatchObject({
      classification: 'compilation',
      action: 'feedback',
      attempt: 1,
      maxAttempts: 3,
    });
  });

  it('withdraws the hint and asks a human after the attempt limit', async () => {
    const project = await setupProject(COMPILE_ERROR);
    await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: project.root });
    for (let i = 0; i < 3; i++) {
      await runTddPhase({ ...red, projectRoot: project.root });
    }
    const res = await computeNextAction({ projectRoot: project.root, featureId: 'FEATURE-001' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.recoveryHint).toBeUndefined();
    expect(res.value.blockingQuestions.join(' ')).toMatch(/exhausted/);
  });

  it('advertises the default timeout the runner enforces', async () => {
    const saved = process.env.KIT_TIMEOUT_MS;
    delete process.env.KIT_TIMEOUT_MS;
    try {
      const project = await setupProject();
      const res = await computeNextAction({ projectRoot: project.root, featureId: 'FEATURE-001' });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value.constraints.timeoutMs).toBe(180_000);
    } finally {
      if (saved === undefined) delete process.env.KIT_TIMEOUT_MS;
      else process.env.KIT_TIMEOUT_MS = saved;
    }
  });

  it('advertises a KIT_TIMEOUT_MS override, since that is what the runner enforces', async () => {
    const saved = process.env.KIT_TIMEOUT_MS;
    process.env.KIT_TIMEOUT_MS = '5000';
    try {
      const project = await setupProject();
      const res = await computeNextAction({ projectRoot: project.root, featureId: 'FEATURE-001' });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value.constraints.timeoutMs).toBe(5000);
    } finally {
      if (saved === undefined) delete process.env.KIT_TIMEOUT_MS;
      else process.env.KIT_TIMEOUT_MS = saved;
    }
  });
});

describe('decision trace (item 3)', () => {
  const COMPILE_ERROR = "src/feature.ts:12:5 - error TS2304: Cannot find name 'missing'.";
  const red = { featureId: 'FEATURE-001', taskId: 'TASK-001', phase: 'red' as const };

  it('records each offered action, once per change, in the verifiable journal', async () => {
    const project = await setupProject(COMPILE_ERROR);
    await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: project.root });
    const before = await computeNextAction({ projectRoot: project.root, featureId: 'FEATURE-001' });
    if (!before.ok) throw new Error(before.error.message);
    await recordNextOffer(project.root, before.value);
    await recordNextOffer(project.root, before.value); // unchanged: not recorded again

    await runTddPhase({ ...red, projectRoot: project.root }); // rejected: the offer changes
    const after = await computeNextAction({ projectRoot: project.root, featureId: 'FEATURE-001' });
    if (!after.ok) throw new Error(after.error.message);
    await recordNextOffer(project.root, after.value);

    const journal = await readJournal(project.root, 'FEATURE-001');
    if (!journal.ok) throw new Error(journal.error.message);
    const offers = journal.value.filter((e) => e.kind === 'next.offered');
    expect(offers).toHaveLength(2);
    expect(offers[0]?.payload).toMatchObject({ requiredAction: 'task.red', taskId: 'TASK-001', phase: 'red' });
    expect(offers[1]?.payload).toMatchObject({ requiredAction: 'task.red', recoveryClassification: 'compilation' });
    expect((await verifyJournal(project.root, 'FEATURE-001')).ok).toBe(true);
  });

  it('does not record the protocol start, since no run exists yet', async () => {
    const project = await setupProject();
    const res = await computeNextAction({ projectRoot: project.root, featureId: 'FEATURE-001' });
    if (!res.ok) throw new Error(res.error.message);
    await recordNextOffer(project.root, res.value);
    const journal = await readJournal(project.root, 'FEATURE-001');
    expect(journal.ok ? journal.value.length : 0).toBe(0);
  });

  it('stamps each phase verdict with the id of the exact evidence it judged', async () => {
    const project = await setupProject(COMPILE_ERROR);
    await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: project.root });
    await runTddPhase({ ...red, projectRoot: project.root });
    const journal = await readJournal(project.root, 'FEATURE-001');
    if (!journal.ok) throw new Error(journal.error.message);
    const verdict = journal.value.find((e) => e.kind === 'phase.rejected');
    const evidenceId = verdict?.payload['evidenceId'];
    expect(typeof evidenceId).toBe('string');
    expect(evidenceId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives the same evidence id for the same output, and a different one for different output', async () => {
    const first = await setupProject(COMPILE_ERROR);
    const second = await setupProject("src/other.ts:3:1 - error TS1005: ';' expected.");
    await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: first.root });
    await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: second.root });
    await runTddPhase({ ...red, projectRoot: first.root });
    await runTddPhase({ ...red, projectRoot: second.root });
    const idOf = async (root: string) => {
      const journal = await readJournal(root, 'FEATURE-001');
      if (!journal.ok) throw new Error(journal.error.message);
      return journal.value.find((e) => e.kind === 'phase.rejected')?.payload['evidenceId'];
    };
    const idA = await idOf(first.root);
    const idB = await idOf(second.root);
    expect(idA).not.toBe(idB);
    await runTddPhase({ ...red, projectRoot: first.root });
    expect(await idOf(first.root)).toBe(idA);
  });
});
