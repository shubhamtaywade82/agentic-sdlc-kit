// packages/core/src/workflows/feature-workflow.test.ts
//
// Tests the phase-gated TDD feature workflow. The task's verification
// command is `node -e "...existsSync('done.txt') ? 0 : 1"`: it fails until
// "done.txt" exists. The tests create/remove that marker between gates to
// simulate the agent writing the failing test, implementing, and
// refactoring — proving the gates react to REAL process outcomes.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializeProfileYaml } from '../project-profile/serializer.js';
import { generateSpecMarkdown, scaffoldSpecification } from '../specification/scaffolder.js';
import { runFeatureWorkflow } from './feature-workflow.js';
import { loadFeatureState } from './feature-state.js';

// Fails until <root>/done.txt exists — like a test that fails until the
// feature is implemented.
const GATE_CMD = [
  'node',
  '-e',
  "const fs=require('fs');process.exit(fs.existsSync('done.txt')?0:1)",
];

async function makeProject(withDoneMarker = false): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-feature-test-'));

  const aiKitDir = path.join(tmp, '.ai-kit');
  await fs.mkdir(aiKitDir, { recursive: true });
  await fs.writeFile(
    path.join(aiKitDir, 'project.yml'),
    serializeProfileYaml({
      schemaVersion: 1,
      name: 'test-feature-app',
      stack: ['node-typescript'],
      commands: { test: [['node', '-e', 'process.exit(0)']] },
    }),
  );

  const specFeaturesDir = path.join(tmp, 'docs', 'specifications', 'features');
  await scaffoldSpecification({
    id: 'FEATURE-001',
    title: 'RBAC System',
    targetDir: specFeaturesDir,
  });

  const planDir = path.join(tmp, 'docs', 'plans', 'FEATURE-001');
  await fs.mkdir(planDir, { recursive: true });
  const plan = {
    featureId: 'FEATURE-001',
    tasks: [
      {
        id: 'TASK-001',
        description: 'Implement role models',
        acceptanceCriteria: ['Roles exist'],
        verification: { command: GATE_CMD, expectedStatus: 'passed' },
        dependencies: [],
        likelyFiles: ['src/roles.ts'],
        estimatedScope: 's',
        risk: 'low',
      },
    ],
    edges: [],
    verticalSlices: [['TASK-001']],
  };
  await fs.writeFile(path.join(planDir, 'plan.json'), JSON.stringify(plan, null, 2));

  if (withDoneMarker) await fs.writeFile(path.join(tmp, 'done.txt'), '', 'utf8');
  return tmp;
}

describe('runFeatureWorkflow (phase-gated TDD)', () => {
  it('drives a full red -> green -> refactor cycle with real evidence', async () => {
    const tmp = await makeProject();
    try {
      // Start: no evidence, first task awaiting red.
      const start = await runFeatureWorkflow({
        featureId: 'FEATURE-001',
        projectRoot: tmp,
        action: 'start',
      });
      expect(start.ok).toBe(true);
      if (start.ok) {
        expect(start.value.status).toBe('awaiting-red');
        expect(start.value.currentTaskId).toBe('TASK-001');
        expect(start.value.tasksExecuted).toEqual([]);
        expect(start.value.nextAction).toContain('--red TASK-001');
      }

      // Red gate: no done.txt yet, so the verification command FAILS.
      // That is exactly what TDD requires before implementing.
      const red = await runFeatureWorkflow({
        featureId: 'FEATURE-001',
        projectRoot: tmp,
        action: 'red',
        taskId: 'TASK-001',
      });
      expect(red.ok).toBe(true);
      if (red.ok) {
        expect(red.value.status).toBe('awaiting-implementation');
        expect(red.value.tdd[0]?.red?.status).toBe('failed');
        expect(red.value.nextAction).toContain('--green TASK-001');
      }

      // "Implement": create the marker the gate command looks for.
      await fs.writeFile(path.join(tmp, 'done.txt'), '', 'utf8');

      const green = await runFeatureWorkflow({
        featureId: 'FEATURE-001',
        projectRoot: tmp,
        action: 'green',
        taskId: 'TASK-001',
      });
      expect(green.ok).toBe(true);
      if (green.ok) {
        expect(green.value.status).toBe('awaiting-refactor');
        expect(green.value.tdd[0]?.green?.status).toBe('passed');
      }

      // Refactor: behavior stays green -> task completes, and because it is
      // the last task the final regression runs immediately.
      const refactor = await runFeatureWorkflow({
        featureId: 'FEATURE-001',
        projectRoot: tmp,
        action: 'refactor',
        taskId: 'TASK-001',
      });
      expect(refactor.ok).toBe(true);
      if (refactor.ok) {
        expect(refactor.value.tasksExecuted).toEqual(['TASK-001']);
        expect(refactor.value.verification?.status).toBe('passed');
        expect(refactor.value.status).toBe('completed');
      }

      // The persisted state carries all three evidence records.
      const state = await loadFeatureState(tmp, 'FEATURE-001');
      expect(state?.tasks['TASK-001']?.red?.status).toBe('failed');
      expect(state?.tasks['TASK-001']?.green?.status).toBe('passed');
      expect(state?.tasks['TASK-001']?.refactor?.status).toBe('passed');
      expect(state?.finalVerification?.status).toBe('passed');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('BLOCKS the red gate when verification passes (no failing test)', async () => {
    // done.txt exists from the start, so the gate command passes — the
    // "failing test" does not fail. The old workflow reported this as a
    // PASSED feature; the phase gate must refuse to advance.
    const tmp = await makeProject(true);
    try {
      await runFeatureWorkflow({ featureId: 'FEATURE-001', projectRoot: tmp, action: 'start' });
      const red = await runFeatureWorkflow({
        featureId: 'FEATURE-001',
        projectRoot: tmp,
        action: 'red',
        taskId: 'TASK-001',
      });
      expect(red.ok).toBe(false);
      if (!red.ok) {
        expect(red.error.message).toContain('Red phase invariant violated');
      }
      // State unchanged: still awaiting red, no evidence recorded.
      const state = await loadFeatureState(tmp, 'FEATURE-001');
      expect(state?.tasks['TASK-001']?.phase).toBe('awaiting-red');
      expect(state?.tasks['TASK-001']?.red).toBeUndefined();
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('keeps awaiting-implementation when the green gate fails', async () => {
    const tmp = await makeProject();
    try {
      await runFeatureWorkflow({ featureId: 'FEATURE-001', projectRoot: tmp, action: 'start' });
      await runFeatureWorkflow({
        featureId: 'FEATURE-001',
        projectRoot: tmp,
        action: 'red',
        taskId: 'TASK-001',
      });
      // No done.txt: implementation "not done yet".
      const green = await runFeatureWorkflow({
        featureId: 'FEATURE-001',
        projectRoot: tmp,
        action: 'green',
        taskId: 'TASK-001',
      });
      expect(green.ok).toBe(false);
      if (!green.ok) expect(green.error.message).toContain('Green phase failed');
      const state = await loadFeatureState(tmp, 'FEATURE-001');
      expect(state?.tasks['TASK-001']?.phase).toBe('awaiting-implementation');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('rejects gates driven out of order', async () => {
    const tmp = await makeProject();
    try {
      await runFeatureWorkflow({ featureId: 'FEATURE-001', projectRoot: tmp, action: 'start' });
      // Green before red:
      const green = await runFeatureWorkflow({
        featureId: 'FEATURE-001',
        projectRoot: tmp,
        action: 'green',
        taskId: 'TASK-001',
      });
      expect(green.ok).toBe(false);
      if (!green.ok) expect(green.error.message).toContain("phase 'awaiting-red'");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('blocks final verification until every task has full evidence', async () => {
    const tmp = await makeProject();
    try {
      await runFeatureWorkflow({ featureId: 'FEATURE-001', projectRoot: tmp, action: 'start' });
      const verify = await runFeatureWorkflow({
        featureId: 'FEATURE-001',
        projectRoot: tmp,
        action: 'verify',
      });
      expect(verify.ok).toBe(false);
      if (!verify.ok) {
        expect(verify.error.message).toContain('lack full TDD evidence');
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('dry-run executes nothing and writes no state', async () => {
    const tmp = await makeProject();
    try {
      const res = await runFeatureWorkflow({
        featureId: 'FEATURE-001',
        projectRoot: tmp,
        action: 'start',
        dryRun: true,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.status).toBe('planned');
        expect(res.value.tasksPlanned).toEqual(['TASK-001']);
        // "Executed" is empty in a dry run — nothing ran.
        expect(res.value.tasksExecuted).toEqual([]);
      }
      const state = await loadFeatureState(tmp, 'FEATURE-001');
      expect(state).toBeNull();
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('rejects a spec whose id does not match the requested feature', async () => {
    const tmp = await makeProject();
    try {
      // Overwrite the FEATURE-001 spec with a schema-valid spec whose id
      // is FEATURE-002 — the directory contents belong to another feature.
      await fs.writeFile(
        path.join(tmp, 'docs', 'specifications', 'features', 'FEATURE-001', 'SPEC.md'),
        generateSpecMarkdown('FEATURE-002', 'Other Feature'),
        'utf8',
      );
      const res = await runFeatureWorkflow({
        featureId: 'FEATURE-001',
        projectRoot: tmp,
        action: 'start',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.message).toContain('does not match requested feature');
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
