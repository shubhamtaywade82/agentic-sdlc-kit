// packages/cli/src/application/agent/test-fixture.ts
//
// Git-backed fixture project for Mode 1 (orchestration) tests, PR3.
//
// Mode 1 executes in a git WORKTREE, so the fixture must be a real git
// repository with everything the workflow needs COMMITTED: the project
// profile, the specification, the plan, and a per-task verification
// script. The script fails with a REAL assertion failure until a
// per-task marker file exists — the orchestration tests' mock provider
// "implements" a task by creating that marker inside the workspace,
// exactly where a real provider's edits would land.
//
// This file is test support (matched by the architecture gate's test-file
// rule); it imports only core and node builtins.

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { scaffoldSpecification, serializeProfileYaml } from '@agentic-sdlc-kit/core';

const exec = promisify(execFile);

export interface OrchestrationFixture {
  readonly root: string;
  readonly featureId: 'FEATURE-001';
  readonly taskIds: readonly ['TASK-001', 'TASK-002'];
}

function git(args: readonly string[], cwd: string): Promise<string> {
  return exec(
    'git',
    ['-c', 'user.email=kit@example.com', '-c', 'user.name=kit-test', ...args],
    { cwd, timeout: 30_000 },
  ).then((r) => r.stdout);
}

/**
 * Build the committed fixture repository. `check.js TASK-00N` fails with
 * an assertion failure until `.done-TASK-00N` exists NEXT TO IT (it
 * resolves the marker relative to the process cwd, so the same committed
 * script works inside any worktree).
 */
export async function buildOrchestrationFixture(): Promise<OrchestrationFixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-mode1-orchestration-'));

  await git(['init', '-b', 'main'], root);

  // Only the RUNTIME directories are ignored; the project profile under
  // .ai-kit/ is project configuration and must be COMMITTED so every
  // worktree checkout has it (the same convention the kit documents).
  await fs.writeFile(
    path.join(root, '.gitignore'),
    ['.ai-kit/state/', '.ai-kit/worktrees/', 'node_modules/', ''].join('\n'),
  );

  await fs.writeFile(
    path.join(root, 'check.js'),
    [
      'const task = process.argv[2];',
      'if (!task) { console.error("AssertionError: missing task argument"); process.exit(1); }',
      'const fs = require("node:fs");',
      'if (!fs.existsSync(".done-" + task)) {',
      '  console.error("AssertionError: expected target for " + task + " to be implemented (marker .done-" + task + " missing)");',
      '  process.exit(1);',
      '}',
      'process.exit(0);',
    ].join('\n') + '\n',
  );

  await fs.mkdir(path.join(root, '.ai-kit'), { recursive: true });
  await fs.writeFile(
    path.join(root, '.ai-kit', 'project.yml'),
    serializeProfileYaml({
      schemaVersion: 1,
      name: 'mode1-fixture-app',
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
    title: 'Mode 1 Fixture',
    targetDir: path.join(root, 'docs', 'specifications', 'features'),
  });

  const planDir = path.join(root, 'docs', 'plans', 'FEATURE-001');
  await fs.mkdir(planDir, { recursive: true });
  const taskIds = ['TASK-001', 'TASK-002'] as const;
  await fs.writeFile(
    path.join(planDir, 'plan.json'),
    JSON.stringify(
      {
        featureId: 'FEATURE-001',
        tasks: taskIds.map((id) => ({
          id,
          description: `Implement ${id} of the Mode 1 fixture`,
          acceptanceCriteria: [`${id} target implemented`, 'no regressions'],
          verification: { command: ['node', 'check.js', id], expectedStatus: 'passed' },
          dependencies: [],
          likelyFiles: [`src/${id.toLowerCase()}.ts`],
          estimatedScope: 's',
          risk: 'low',
        })),
        edges: [],
        verticalSlices: taskIds.map((id) => [id]),
      },
      null,
      2,
    ) + '\n',
  );

  await git(['add', '.'], root);
  await git(['commit', '-m', 'fixture: mode 1 orchestration baseline'], root);

  return { root, featureId: 'FEATURE-001', taskIds };
}

/** The marker path a "green" agent creates for a task inside a workspace. */
export function markerPath(workspaceRoot: string, taskId: string): string {
  return path.join(workspaceRoot, `.done-${taskId}`);
}
