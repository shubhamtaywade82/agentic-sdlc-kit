// packages/core/src/workflows/feature-workflow.test.ts
//
// Tests for the phase-driven TDD feature workflow (ADR-0018):
// evidence-gated Red -> Green -> Refactor with persisted run state.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializeProfileYaml } from '../project-profile/serializer.js';
import { scaffoldSpecification } from '../specification/scaffolder.js';
import {
  finalizeFeatureRun,
  getFeatureRunState,
  runFeatureWorkflow,
  runTddPhase,
  startFeatureRun,
} from './feature-workflow.js';

interface TestProject {
  readonly root: string;
  readonly marker: string;
}

/**
 * Scaffold a project whose test command fails until a marker file exists.
 * The marker simulates the agent implementing the task between phases:
 * Red runs with the marker absent (must fail); the test creates the marker
 * to simulate implementation; Green/Refactor then pass.
 */
async function setupProject(taskIds: readonly string[]): Promise<TestProject> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-tdd-workflow-'));
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
      '  console.error("MARKER MISSING: target not implemented");',
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
      name: 'test-tdd-app',
      stack: ['node-typescript'],
      commands: { test: [['node', script]] },
    }),
  );

  await scaffoldSpecification({
    id: 'FEATURE-001',
    title: 'RBAC System',
    targetDir: path.join(tmp, 'docs', 'specifications', 'features'),
  });

  const planDir = path.join(tmp, 'docs', 'plans', 'FEATURE-001');
  await fs.mkdir(planDir, { recursive: true });
  const plan = {
    featureId: 'FEATURE-001',
    tasks: taskIds.map((id) => ({
      id,
      description: `Implement ${id}`,
      acceptanceCriteria: [`${id} works`],
      verification: { command: ['node', script], expectedStatus: 'passed' },
      dependencies: [],
      likelyFiles: [`src/${id}.ts`],
      estimatedScope: 's',
      risk: 'low',
    })),
    edges: [],
    verticalSlices: taskIds.map((id) => [id]),
  };
  await fs.writeFile(path.join(planDir, 'plan.json'), JSON.stringify(plan, null, 2));

  return { root: tmp, marker };
}

async function completeTask(
  project: TestProject,
  taskId: string,
): Promise<void> {
  const base = { featureId: 'FEATURE-001', projectRoot: project.root };
  const red = await runTddPhase({ ...base, taskId, phase: 'red' });
  expect(red.ok).toBe(true);
  await fs.writeFile(project.marker, '');
  const green = await runTddPhase({ ...base, taskId, phase: 'green' });
  expect(green.ok).toBe(true);
  const refactor = await runTddPhase({ ...base, taskId, phase: 'refactor' });
  expect(refactor.ok).toBe(true);
}

describe('startFeatureRun', () => {
  it('initializes every planned task in the red phase', async () => {
    const project = await setupProject(['TASK-001', 'TASK-002']);
    try {
      const res = await startFeatureRun({
        featureId: 'FEATURE-001',
        projectRoot: project.root,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.tasks['TASK-001']?.phase).toBe('red');
        expect(res.value.tasks['TASK-002']?.phase).toBe('red');
      }
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('rejects a second start to protect accumulated evidence', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: project.root });
      const again = await startFeatureRun({
        featureId: 'FEATURE-001',
        projectRoot: project.root,
      });
      expect(again.ok).toBe(false);
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });
});

describe('runTddPhase (real TDD handoff)', () => {
  it('records red only when verification actually fails, with output evidence', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: project.root });
      const red = await runTddPhase({
        featureId: 'FEATURE-001',
        projectRoot: project.root,
        taskId: 'TASK-001',
        phase: 'red',
      });
      expect(red.ok).toBe(true);
      if (red.ok) {
        const task = red.value.tasks['TASK-001'];
        expect(task?.phase).toBe('green');
        expect(task?.records).toHaveLength(1);
        expect(task?.records[0]?.status).toBe('failed');
        expect(task?.records[0]?.evidence).toContain('MARKER MISSING');
      }
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('rejects a red phase where the test already passes (invariant violation)', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: project.root });
      // Simulate an agent that wrote a test that cannot fail.
      await fs.writeFile(project.marker, '');
      const red = await runTddPhase({
        featureId: 'FEATURE-001',
        projectRoot: project.root,
        taskId: 'TASK-001',
        phase: 'red',
      });
      expect(red.ok).toBe(false);
      if (!red.ok) expect(red.error.message).toContain('Red phase invariant violated');
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('blocks green until the agent actually makes verification pass', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      const base = { featureId: 'FEATURE-001', projectRoot: project.root };
      await startFeatureRun(base);
      await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'red' });

      // No implementation happened: green must fail and stay in green phase.
      const early = await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'green' });
      expect(early.ok).toBe(false);

      // Agent implements; now green succeeds and refactor completes.
      await fs.writeFile(project.marker, '');
      const green = await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'green' });
      expect(green.ok).toBe(true);
      if (green.ok) {
        const task = green.value.tasks['TASK-001'];
        expect(task?.phase).toBe('refactor');
        expect(task?.records.at(-1)?.status).toBe('passed');
      }

      const refactor = await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'refactor' });
      expect(refactor.ok).toBe(true);
      if (refactor.ok) {
        const task = refactor.value.tasks['TASK-001'];
        expect(task?.phase).toBe('completed');
        // 4 records: red:failed, green:failed (blocked attempt), green:passed,
        // refactor:passed — failed attempts are persisted as real evidence.
        expect(task?.records).toHaveLength(4);
        expect(task?.records[1]).toMatchObject({ phase: 'green', status: 'failed' });
        // Refactor must re-run verification, not fabricate a status.
        expect(task?.records[3]?.evidence).toContain('test:passed');
      }
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('rejects phase invocations out of order', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      await startFeatureRun({ featureId: 'FEATURE-001', projectRoot: project.root });
      const res = await runTddPhase({
        featureId: 'FEATURE-001',
        projectRoot: project.root,
        taskId: 'TASK-001',
        phase: 'green',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.message).toContain('Phase mismatch');
        expect(res.error.message).toContain("'red'");
      }
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('rejects red evidence when no check actually executed (vacuous evidence)', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      // A profile with no commands is valid but runs nothing.
      const profilePath = path.join(project.root, '.ai-kit', 'project.yml');
      await fs.writeFile(
        profilePath,
        [
          'schemaVersion: 1',
          'name: test-tdd-app',
          'stack:',
          '  - node-typescript',
          'commands: {}',
          '',
        ].join('\n'),
      );
      const base = { featureId: 'FEATURE-001', projectRoot: project.root };
      await startFeatureRun(base);
      const res = await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'red' });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.message).toContain('no check actually executed');
      }
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('persists run state across invocations (the handoff boundary)', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      const base = { featureId: 'FEATURE-001', projectRoot: project.root };
      await startFeatureRun(base);
      await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'red' });

      // A fresh invocation (separate process in real usage) reloads state.
      const state = await getFeatureRunState(project.root, 'FEATURE-001');
      expect(state.ok).toBe(true);
      if (state.ok) {
        expect(state.value.tasks['TASK-001']?.phase).toBe('green');
        expect(state.value.tasks['TASK-001']?.records).toHaveLength(1);
      }
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });
});

describe('finalizeFeatureRun (evidence gate)', () => {
  it('fails when any task lacks a complete evidence chain', async () => {
    const project = await setupProject(['TASK-001', 'TASK-002']);
    try {
      const base = { featureId: 'FEATURE-001', projectRoot: project.root };
      await startFeatureRun(base);
      await completeTask(project, 'TASK-001');
      // TASK-002 untouched.

      const res = await finalizeFeatureRun(base);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.message).toContain('TDD evidence missing');
        expect(res.error.message).toContain('TASK-002');
      }
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('produces a passed report with the full evidence chain', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      const base = { featureId: 'FEATURE-001', projectRoot: project.root };
      await startFeatureRun(base);
      await completeTask(project, 'TASK-001');

      const res = await finalizeFeatureRun(base);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.status).toBe('passed');
        expect(res.value.tddEvidence).toHaveLength(1);
        expect(res.value.tddEvidence[0]?.records).toHaveLength(3);
      }
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });
});

describe('runFeatureWorkflow (one-shot audit mode)', () => {
  it('refuses to report success without a persisted evidence chain', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      const res = await runFeatureWorkflow({
        featureId: 'FEATURE-001',
        projectRoot: project.root,
        dryRun: false,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toContain('TDD evidence missing');
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('passes only after the phase driver completed every task', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      const base = { featureId: 'FEATURE-001', projectRoot: project.root, dryRun: false };
      await startFeatureRun(base);
      await completeTask(project, 'TASK-001');
      const res = await runFeatureWorkflow(base);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value.status).toBe('passed');
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });
});
