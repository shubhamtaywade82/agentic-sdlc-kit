// packages/cli/src/commands/feature.test.ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scaffoldSpecification, serializeProfileYaml } from '@agentic-sdlc-kit/core';
import { MockAgentProvider } from '@agentic-sdlc-kit/testing';
import type { AgentProvider } from '@agentic-sdlc-kit/contracts';
import { buildOrchestrationFixture } from '../application/agent/test-fixture.js';
import { createFeatureCommand, featureCommand } from './feature.js';
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

async function setupProject(): Promise<{ root: string; marker: string }> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-feature-'));
  const marker = path.join(tmp, '.done');

  await fs.mkdir(path.join(tmp, '.git'), { recursive: true });
  await fs.writeFile(path.join(tmp, '.git', 'HEAD'), 'ref: refs/heads/main\n');

  // Test command fails with a real assertion-style failure until the agent
  // "implements" (creates the marker). The failure output must look like a
  // test assertion failure: only classification 'assertion' establishes Red.
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
      name: 'cli-feature-app',
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
  await fs.writeFile(
    path.join(planDir, 'plan.json'),
    JSON.stringify(
      {
        featureId: 'FEATURE-001',
        tasks: [
          {
            id: 'TASK-001',
            description: 'Implement role models',
            acceptanceCriteria: ['Roles exist'],
            verification: { command: ['node', script], expectedStatus: 'passed' },
            dependencies: [],
            likelyFiles: ['src/roles.ts'],
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

  return { root: tmp, marker };
}

describe('featureCommand', () => {
  it('shows help when --help is passed', async () => {
    const ctx = makeCtx(['--help'], '/');
    const r = await featureCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    expect(ctx.out[0]).toContain('Usage: kit feature');
  });

  it('fails if feature ID is missing', async () => {
    const ctx = makeCtx([], '/');
    const r = await featureCommand.run(ctx);
    expect(r.exitCode).toBe(1);
    expect(ctx.err[0]).toContain('missing required feature identifier');
  });

  it('drives the full TDD protocol across invocations', async () => {
    const project = await setupProject();
    try {
      // start
      const startCtx = makeCtx(['FEATURE-001', 'start'], project.root);
      const start = await featureCommand.run(startCtx);
      expect(start.exitCode).toBe(0);
      expect(startCtx.out[0]).toContain('TASK-001');
      expect(startCtx.out[0]).toContain('red');

      // red: verification must fail before implementation
      const redCtx = makeCtx(['FEATURE-001', 'red', 'TASK-001'], project.root);
      const red = await featureCommand.run(redCtx);
      expect(red.exitCode).toBe(0);
      expect(redCtx.out[0]).toContain('green');

      // green before implementing: blocked, stays in green phase
      const earlyCtx = makeCtx(['FEATURE-001', 'green', 'TASK-001'], project.root);
      const early = await featureCommand.run(earlyCtx);
      expect(early.exitCode).toBe(1);

      // agent implements, then green and refactor
      await fs.writeFile(project.marker, '');
      const greenCtx = makeCtx(['FEATURE-001', 'green', 'TASK-001'], project.root);
      const green = await featureCommand.run(greenCtx);
      expect(green.exitCode).toBe(0);
      expect(greenCtx.out[0]).toContain('refactor');

      const refactorCtx = makeCtx(['FEATURE-001', 'refactor', 'TASK-001'], project.root);
      const refactor = await featureCommand.run(refactorCtx);
      expect(refactor.exitCode).toBe(0);
      expect(refactorCtx.out[0]).toContain('completed');

      // verify: evidence chain complete
      const verifyCtx = makeCtx(['FEATURE-001', 'verify'], project.root);
      const verify = await featureCommand.run(verifyCtx);
      expect(verify.exitCode).toBe(0);
      expect(verifyCtx.out[0]).toContain('PASSED');
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('rejects phases invoked out of order', async () => {
    const project = await setupProject();
    try {
      await featureCommand.run(makeCtx(['FEATURE-001', 'start'], project.root));
      const ctx = makeCtx(['FEATURE-001', 'green', 'TASK-001'], project.root);
      const r = await featureCommand.run(ctx);
      expect(r.exitCode).toBe(1);
      expect(ctx.err[0]).toContain('Phase mismatch');
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });
});

describe('featureCommand run (Mode 1, PR3+PR4)', () => {
  // A deterministic stand-in for a registered-but-unavailable provider: PR4
  // gates `run` on the provider's healthCheck (exit 3, honest message,
  // never a silent fallback) before anything durable happens.
  const unavailableClaudeCode = (): AgentProvider => ({
    id: 'claude-code',
    async capabilities() {
      return {
        capabilities: ['repository.read', 'repository.write', 'process.test'],
        budgetEnforcement: {
          maxDurationMs: 'gateway-enforced',
          maxToolCalls: 'gateway-enforced',
          maxInputTokens: 'best-effort',
          maxOutputTokens: 'best-effort',
          maxTotalTokens: 'best-effort',
          maxEstimatedCost: 'best-effort',
        },
      };
    },
    async healthCheck() {
      return { available: false, message: 'stub: claude CLI not installed on this machine' };
    },
    async start() {
      throw new Error('unavailable provider must never be started');
    },
    async resume() {
      throw new Error('unavailable provider must never be resumed');
    },
    async cancel() {},
  });

  it('is blocked (exit 3) when the default claude-code provider is unavailable — AGENT_PROVIDER_UNAVAILABLE, never a silent fallback', async () => {
    const project = await setupProject();
    try {
      const command = createFeatureCommand({ agentProviders: [unavailableClaudeCode()] });
      const ctx = makeCtx(['FEATURE-001', 'run'], project.root);
      const r = await command.run(ctx);
      expect(r.exitCode).toBe(3);
      expect(ctx.err[0]).toContain('AGENT_PROVIDER_UNAVAILABLE');
      expect(ctx.err[0]).toContain('claude-code');
      expect(ctx.err[0]).toContain('will not fall back');
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('is blocked (exit 3) when --provider names an unregistered provider', async () => {
    const project = await setupProject();
    try {
      // The shipped default registers claude-code (PR4); 'codex' is not it.
      const ctx = makeCtx(['FEATURE-001', 'run', '--provider', 'codex'], project.root);
      const r = await featureCommand.run(ctx);
      expect(r.exitCode).toBe(3);
      expect(ctx.err[0]).toContain('No agent provider');
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('is blocked (exit 3) for `run` in a build that registers NO providers (PR3 contract preserved)', async () => {
    const project = await setupProject();
    try {
      const command = createFeatureCommand({ agentProviders: [] });
      const ctx = makeCtx(['FEATURE-001', 'run'], project.root);
      const r = await command.run(ctx);
      expect(r.exitCode).toBe(3);
      expect(ctx.err[0]).toContain("No agent provider 'claude-code' is configured");
      expect(ctx.err[0]).toContain('will not fall back');
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('orchestrates the full lifecycle through an injected mock provider and exits 0', async () => {
    const fixture = await buildOrchestrationFixture();
    try {
      const command = createFeatureCommand({
        agentProviders: [
          new MockAgentProvider({
            performWork: async (request) => {
              if (request.instructions.includes('Phase: green')) {
                await fs.writeFile(
                  path.join(request.workspace.rootPath, `.done-${request.taskId}`),
                  'implemented\n',
                );
              }
            },
          }),
        ],
      });
      const ctx = makeCtx(['FEATURE-001', 'run', '--provider', 'mock'], fixture.root);
      const r = await command.run(ctx);
      expect(r.exitCode).toBe(0);
      const joined = ctx.out.join('\n');
      expect(joined).toContain('Mode 1 run RUN-001');
      expect(joined).toContain('TASK-001 red: evidence accepted');
      expect(joined).toContain('Feature Orchestration: FEATURE-001');
      expect(joined).toContain('COMPLETED');
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('reports a lying agent with exit 1 (the evidence gate rejects)', async () => {
    const fixture = await buildOrchestrationFixture();
    try {
      const command = createFeatureCommand({
        agentProviders: [new MockAgentProvider()],
      });
      const ctx = makeCtx(['FEATURE-001', 'run', '--provider', 'mock'], fixture.root);
      const r = await command.run(ctx);
      expect(r.exitCode).toBe(1);
      expect(ctx.out.join('\n')).toContain('PHASE_GATE_REJECTED');
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('emits machine-readable report JSON with --json', async () => {
    const fixture = await buildOrchestrationFixture();
    try {
      const command = createFeatureCommand({
        agentProviders: [
          new MockAgentProvider({
            performWork: async (request) => {
              if (request.instructions.includes('Phase: green')) {
                await fs.writeFile(
                  path.join(request.workspace.rootPath, `.done-${request.taskId}`),
                  'implemented\n',
                );
              }
            },
          }),
        ],
      });
      const ctx = makeCtx(['FEATURE-001', 'run', '--provider', 'mock', '--json'], fixture.root);
      const r = await command.run(ctx);
      expect(r.exitCode).toBe(0);
      const report = JSON.parse(ctx.out[ctx.out.length - 1]);
      expect(report.status).toBe('completed');
      expect(report.runId).toBe('RUN-001');
      expect(report.executions).toHaveLength(6);
      expect(report.workspace.branch).toBe('kit/RUN-001');
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });
});

describe('featureCommand strength (ADR-0022)', () => {
  it('requires a task id and refuses when the profile has no strength section', async () => {
    const project = await setupProject();
    try {
      // No task id.
      const noTask = makeCtx(['FEATURE-001', 'strength'], project.root);
      const r1 = await featureCommand.run(noTask);
      expect(r1.exitCode).toBe(1);
      expect(noTask.err[0]).toContain('strength requires a task id');

      // Task id present, but strength not enabled in the profile (opt-in).
      // Complete the chain properly: red (marker absent -> assertion failure),
      // then implement (marker), then green, then refactor.
      await featureCommand.run(makeCtx(['FEATURE-001', 'start'], project.root));
      await featureCommand.run(makeCtx(['FEATURE-001', 'red', 'TASK-001'], project.root));
      await fs.writeFile(project.marker, '');
      await featureCommand.run(makeCtx(['FEATURE-001', 'green', 'TASK-001'], project.root));
      await featureCommand.run(makeCtx(['FEATURE-001', 'refactor', 'TASK-001'], project.root));

      const ctx = makeCtx(['FEATURE-001', 'strength', 'TASK-001'], project.root);
      const r2 = await featureCommand.run(ctx);
      expect(r2.exitCode).toBe(1);
      expect(ctx.err[0]).toContain('not enabled');
    } finally {
      await fs.rm(project.root, { recursive: true, force: true });
    }
  });

  it('mentions the strength action in help output', async () => {
    const ctx = makeCtx(['--help'], '/');
    await featureCommand.run(ctx);
    expect(ctx.out[0]).toContain('strength <task-id>');
  });
});
