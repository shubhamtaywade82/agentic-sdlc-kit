// packages/core/src/workflows/feature-workflow.test.ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializeProfileYaml } from '../project-profile/serializer.js';
import { scaffoldSpecification } from '../specification/scaffolder.js';
import { runFeatureWorkflow } from './feature-workflow.js';

describe('runFeatureWorkflow', () => {
  it('runs the full feature workflow on a project directory', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-workflow-test-'));
    try {
      // 1. git repo setup
      const gitDir = path.join(tmp, '.git');
      await fs.mkdir(gitDir, { recursive: true });
      await fs.writeFile(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');

      // 2. .ai-kit/project.yml
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

      // 3. docs/specifications/features/FEATURE-001
      const specFeaturesDir = path.join(tmp, 'docs', 'specifications', 'features');
      await scaffoldSpecification({
        id: 'FEATURE-001',
        title: 'RBAC System',
        targetDir: specFeaturesDir,
      });

      // 4. docs/plans/FEATURE-001
      const planDir = path.join(tmp, 'docs', 'plans', 'FEATURE-001');
      await fs.mkdir(planDir, { recursive: true });
      const plan = {
        featureId: 'FEATURE-001',
        tasks: [
          {
            id: 'TASK-001',
            description: 'Implement role models',
            acceptanceCriteria: ['Roles exist'],
            verification: { command: ['node', '-e', 'process.exit(0)'], expectedStatus: 'passed' },
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

      // 5. Run workflow
      const res = await runFeatureWorkflow({
        featureId: 'FEATURE-001',
        projectRoot: tmp,
        dryRun: false,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.featureId).toBe('FEATURE-001');
        expect(res.value.tasksExecuted).toEqual(['TASK-001']);
        expect(res.value.status).toBe('passed');
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
