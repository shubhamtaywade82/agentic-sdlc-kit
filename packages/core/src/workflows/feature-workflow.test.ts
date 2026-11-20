// packages/core/src/workflows/feature-workflow.test.ts
//
// Tests for the phase-driven TDD feature workflow (ADR-0018):
// evidence-gated Red -> Green -> Refactor with persisted run state,
// task-scoped verification and failure classification (ADR-0018 P1).
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
import { featureRunPath } from './tdd-run-store.js';

interface TestProject {
  readonly root: string;
  readonly marker: string;
}

/**
 * Scaffold a project whose task verification fails with a REAL assertion
 * failure until a marker file exists. The marker simulates the agent
 * implementing the task between phases: Red runs with the marker absent
 * (must fail at an assertion); the test creates the marker to simulate
 * implementation; Green/Refactor then pass.
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
      '  console.error("AssertionError: expected marker to exist (target not implemented)");',
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

/**
 * Replace one task's verification command in the persisted plan — used to
 * point a task at a script that fails in a specific, classifiable way.
 */
async function patchTaskVerification(
  root: string,
  taskId: string,
  command: readonly string[],
): Promise<void> {
  const planPath = path.join(root, 'docs', 'plans', 'FEATURE-001', 'plan.json');
  const plan = JSON.parse(await fs.readFile(planPath, 'utf8')) as {
    tasks: Array<{ id: string; verification: { command: string[] } }>;
  };
  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`task ${taskId} not found in plan fixture`);
  task.verification.command = [...command];
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2));
}

/** Write a script under the project root and return its absolute path. */
async function writeScript(root: string, name: string, lines: readonly string[]): Promise<string> {
  const script = path.join(root, name);
  await fs.writeFile(script, `${lines.join('\n')}\n`);
  return script;
}

async function completeTask(project: TestProject, taskId: string): Promise<void> {
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

describe('runTddPhase (task-scoped evidence, ADR-0018 P1)', () => {
  it('records red only when the targeted test fails at an assertion, with structured evidence', async () => {
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
        expect(task?.records[0]?.evidence).toContain('AssertionError');
        expect(task?.records[0]?.evidence).toContain('classification=assertion');
        expect(task?.records[0]?.verification).toMatchObject({
          taskId: 'TASK-001',
          classification: 'assertion',
        });
        expect(task?.records[0]?.verification?.command[0]).toBe('node');
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

  it('blocks green until the agent actually makes the targeted test pass', async () => {
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
        expect(task?.records.at(-1)?.verification?.classification).toBeNull();
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
        // Refactor must re-run the targeted verification, not fabricate a status.
        expect(task?.records[3]?.evidence).toContain('exit=0');
        expect(task?.records[3]?.verification?.classification).toBeNull();
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

  it('fails closed when the plan task lacks a verification command', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      const base = { featureId: 'FEATURE-001', projectRoot: project.root };
      // Start with a VALID plan so the run state exists, then break the
      // plan: Zod must reject it at load time and the phase gate must
      // fail closed (no verification, no evidence).
      await startFeatureRun(base);
      const planPath = path.join(project.root, 'docs', 'plans', 'FEATURE-001', 'plan.json');
      const plan = JSON.parse(await fs.readFile(planPath, 'utf8')) as {
        tasks: Array<Record<string, unknown>>;
      };
      delete plan.tasks[0]!.verification;
      await fs.writeFile(planPath, JSON.stringify(plan, null, 2));

      const res = await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'red' });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.message).toMatch(/verification|Schema validation failed/);
      }
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('fails closed when the task is missing from the plan (diverged state)', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      const base = { featureId: 'FEATURE-001', projectRoot: project.root };
      await startFeatureRun(base);
      // Remove the task from the plan while the run state still has it.
      const planPath = path.join(project.root, 'docs', 'plans', 'FEATURE-001', 'plan.json');
      const plan = JSON.parse(await fs.readFile(planPath, 'utf8')) as {
        tasks: Array<{ id: string }>;
        verticalSlices: string[][];
      };
      plan.tasks = [];
      plan.verticalSlices = [];
      await fs.writeFile(planPath, JSON.stringify(plan, null, 2));

      const res = await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'red' });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.message).toContain('not in the plan');
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
        expect(state.value.schemaVersion).toBe(2);
      }
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });
});

describe('runTddPhase Red classification gate (ADR-0018 P1)', () => {
  // Each case points the task's verification at a script that fails in a
  // specific way. Only classification 'assertion' may establish Red; the
  // rest are recorded as rejected attempts without advancing the phase.
  const cases: ReadonlyArray<{ name: string; script: string[]; expected: string }> = [
    {
      name: 'compilation failure',
      script: [
        'console.error("src/feature.ts:12:5 - error TS2304: Cannot find name \'missing\'.");',
        'process.exit(1);',
      ],
      expected: 'compilation',
    },
    {
      name: 'dependency failure',
      script: [
        'console.error("Error: Cannot find module \'left-pad\'");',
        'console.error("Require stack:");',
        'process.exit(1);',
      ],
      expected: 'dependency',
    },
    {
      name: 'discovery failure (no tests found)',
      script: ['console.error("No tests found, exiting with code 1");', 'process.exit(1);'],
      expected: 'discovery',
    },
    {
      name: 'unclassified failure',
      script: ['console.error("something strange happened in the runner");', 'process.exit(3);'],
      expected: 'unclassified',
    },
  ];

  for (const c of cases) {
    it(`rejects Red evidence for a ${c.name} (classification '${c.expected}')`, async () => {
      const project = await setupProject(['TASK-001']);
      try {
        const script = await writeScript(project.root, 'fails.js', c.script);
        await patchTaskVerification(project.root, 'TASK-001', ['node', script]);
        const base = { featureId: 'FEATURE-001', projectRoot: project.root };
        await startFeatureRun(base);

        const red = await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'red' });
        expect(red.ok).toBe(false);
        if (!red.ok) {
          expect(red.error.message).toContain('Red phase evidence rejected');
          expect(red.error.message).toContain(`'${c.expected}'`);
        }

        // The attempt is persisted as a rejected record (auditable), the
        // phase does NOT advance, and the record cannot later satisfy the chain.
        const state = await getFeatureRunState(project.root, 'FEATURE-001');
        expect(state.ok).toBe(true);
        if (state.ok) {
          const task = state.value.tasks['TASK-001'];
          expect(task?.phase).toBe('red');
          expect(task?.records).toHaveLength(1);
          expect(task?.records[0]?.verification?.classification).toBe(c.expected);
        }
      } finally {
        await fs.rm(project.root, { recursive: true, force: true });
      }
    });
  }

  it('rejects Red evidence when the command cannot start (environment failure)', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      await patchTaskVerification(project.root, 'TASK-001', [
        'kit-definitely-missing-executable-xyz',
        '--flag',
      ]);
      const base = { featureId: 'FEATURE-001', projectRoot: project.root };
      await startFeatureRun(base);

      const red = await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'red' });
      expect(red.ok).toBe(false);
      if (!red.ok) {
        expect(red.error.message).toContain('Red phase evidence rejected');
        expect(red.error.message).toContain("'environment'");
      }
      const state = await getFeatureRunState(project.root, 'FEATURE-001');
      expect(state.ok).toBe(true);
      if (state.ok) {
        expect(state.value.tasks['TASK-001']?.phase).toBe('red');
        expect(state.value.tasks['TASK-001']?.records[0]?.verification?.classification).toBe(
          'environment',
        );
      }
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('rejects Red evidence when the command exceeds its bounded timeout', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      const script = await writeScript(
        project.root,
        'slow.js',
        ['setTimeout(() => { console.error("way too late"); process.exit(1); }, 2000);'],
      );
      await patchTaskVerification(project.root, 'TASK-001', ['node', script]);
      const base = { featureId: 'FEATURE-001', projectRoot: project.root };
      await startFeatureRun(base);

      const red = await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'red', timeoutMs: 150 });
      expect(red.ok).toBe(false);
      if (!red.ok) {
        expect(red.error.message).toContain('Red phase evidence rejected');
        expect(red.error.message).toContain("'timeout'");
      }
      const state = await getFeatureRunState(project.root, 'FEATURE-001');
      expect(state.ok).toBe(true);
      if (state.ok) {
        expect(state.value.tasks['TASK-001']?.phase).toBe('red');
        expect(state.value.tasks['TASK-001']?.records[0]?.verification?.classification).toBe(
          'timeout',
        );
      }
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('lets Red advance from the task command while the profile passes (task-scoped, not profile-scoped)', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      // Profile says everything is fine (unrelated passing checks); the
      // task's own test fails at an assertion. Pre-P1, the phase consulted
      // the profile; now it must consult ONLY the task command.
      const profilePath = path.join(project.root, '.ai-kit', 'project.yml');
      await fs.writeFile(
        profilePath,
        serializeProfileYaml({
          schemaVersion: 1,
          name: 'test-tdd-app',
          stack: ['node-typescript'],
          commands: { test: [['node', '-e', 'process.exit(0)']] },
        }),
      );
      const base = { featureId: 'FEATURE-001', projectRoot: project.root };
      await startFeatureRun(base);
      const red = await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'red' });
      expect(red.ok).toBe(true);
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('lets Green advance from the task command even while the profile fails elsewhere', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      const base = { featureId: 'FEATURE-001', projectRoot: project.root };
      await startFeatureRun(base);
      await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'red' });
      await fs.writeFile(project.marker, '');
      // An unrelated profile check now fails; the targeted test passes.
      // Phase gates are task-scoped; the full profile is audited at verify.
      const profilePath = path.join(project.root, '.ai-kit', 'project.yml');
      await fs.writeFile(
        profilePath,
        serializeProfileYaml({
          schemaVersion: 1,
          name: 'test-tdd-app',
          stack: ['node-typescript'],
          commands: {
            test: [['node', '-e', "console.error('unrelated profile failure'); process.exit(1)"]],
          },
        }),
      );
      const green = await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'green' });
      expect(green.ok).toBe(true);
      if (green.ok) {
        expect(green.value.tasks['TASK-001']?.phase).toBe('refactor');
      }
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });
});

describe('lazy migration of pre-v2 run state', () => {
  it('loads v1 state without crashing and rejects its unclassified chain at finalize (fail closed)', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      const base = { featureId: 'FEATURE-001', projectRoot: project.root };
      await startFeatureRun(base);
      // Overwrite with a hand-written v1 state: a "completed" task whose
      // records lack verification metadata (pre-P1 engine output).
      const v1State = {
        schemaVersion: 1,
        featureId: 'FEATURE-001',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        tasks: {
          'TASK-001': {
            taskId: 'TASK-001',
            phase: 'completed',
            records: [
              { phase: 'red', status: 'failed', timestamp: '2026-01-01T00:00:01.000Z' },
              { phase: 'green', status: 'passed', timestamp: '2026-01-01T00:00:02.000Z' },
              { phase: 'refactor', status: 'passed', timestamp: '2026-01-01T00:00:03.000Z' },
            ],
          },
        },
      };
      await fs.writeFile(featureRunPath(project.root, 'FEATURE-001'), JSON.stringify(v1State, null, 2));

      const loaded = await getFeatureRunState(project.root, 'FEATURE-001');
      expect(loaded.ok).toBe(true); // loads lazily, no crash

      const res = await finalizeFeatureRun(base);
      expect(res.ok).toBe(false); // old unclassified evidence cannot complete a chain
      if (!res.ok) {
        expect(res.error.message).toContain('TDD evidence missing');
      }
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('resumes a v1 run in red phase and re-saves it as schema v2 with classified evidence', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      const base = { featureId: 'FEATURE-001', projectRoot: project.root };
      await startFeatureRun(base);
      const v1State = {
        schemaVersion: 1,
        featureId: 'FEATURE-001',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        tasks: {
          'TASK-001': {
            taskId: 'TASK-001',
            phase: 'red',
            records: [
              { phase: 'red', status: 'failed', timestamp: '2026-01-01T00:00:01.000Z' },
            ],
          },
        },
      };
      await fs.writeFile(featureRunPath(project.root, 'FEATURE-001'), JSON.stringify(v1State, null, 2));

      // Fresh red attempt: the new engine runs the task command and
      // records classified evidence; the file upgrades to schema v2.
      const red = await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'red' });
      expect(red.ok).toBe(true);

      const raw = JSON.parse(
        await fs.readFile(featureRunPath(project.root, 'FEATURE-001'), 'utf8'),
      ) as { schemaVersion: number; tasks: Record<string, { records: unknown[] }> };
      expect(raw.schemaVersion).toBe(2);
      expect(raw.tasks['TASK-001']?.records).toHaveLength(2);
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

  it('fails when a task completed via rejected (non-assertion) red attempts only', async () => {
    const project = await setupProject(['TASK-001']);
    try {
      const script = await writeScript(project.root, 'fails.js', [
        'console.error("error TS2304: Cannot find name \'x\'.");',
        'process.exit(1);',
      ]);
      await patchTaskVerification(project.root, 'TASK-001', ['node', script]);
      const base = { featureId: 'FEATURE-001', projectRoot: project.root };
      await startFeatureRun(base);
      const red = await runTddPhase({ ...base, taskId: 'TASK-001', phase: 'red' });
      expect(red.ok).toBe(false); // rejected as compilation

      // Even though a red:failed record exists, the chain check must not
      // count it: classification is 'compilation', not 'assertion'.
      const res = await finalizeFeatureRun(base);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.message).toContain('TDD evidence missing');
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
