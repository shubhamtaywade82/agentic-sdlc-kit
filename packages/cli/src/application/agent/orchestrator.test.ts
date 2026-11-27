// packages/cli/src/application/agent/orchestrator.test.ts
//
// PR3 ACCEPTANCE (ADR-0019 §5): an integration test completes a simulated
// feature lifecycle through the mock provider WITHOUT duplicating core
// workflow logic. The orchestrator drives the SAME core APIs Mode 2 uses
// (startFeatureRun / runTddPhase / finalizeFeatureRun) against a real git
// worktree; the mock provider simulates the agent's edits by creating the
// per-task marker inside the workspace, exactly where a real provider's
// edits would land.
//
// Plus the honest-failure paths: provider not configured, agent failure
// stops the run, the evidence gate rejects a lying agent, cancellation,
// and cross-invocation resume.

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { featureRunPath, getFeatureRunState } from '@agentic-sdlc-kit/core';
import { MockAgentProvider } from '@agentic-sdlc-kit/testing';
import { AgentGateway } from './gateway.js';
import { runFeatureOrchestration } from './orchestrator.js';
import { buildOrchestrationFixture, markerPath, type OrchestrationFixture } from './test-fixture.js';

const exec = promisify(execFile);

/**
 * The simulated agent: on GREEN phases it "implements" the task by
 * creating the per-task marker inside the execution workspace (a real
 * provider would edit source files there). Red and refactor phases
 * perform no writes — the red test already fails for the right reason,
 * and refactor keeps behavior.
 */
function workingAgent(): MockAgentProvider {
  return new MockAgentProvider({
    performWork: async (request) => {
      if (request.instructions.includes('Phase: green')) {
        await fs.writeFile(markerPath(request.workspace.rootPath, request.taskId), 'implemented\n');
      }
    },
  });
}

function gatewayFor(fixture: OrchestrationFixture, provider: MockAgentProvider): AgentGateway {
  return new AgentGateway({ providers: [provider], projectRoot: fixture.root });
}

describe('PR3 acceptance: full feature lifecycle through the mock provider', () => {
  it('completes Red -> Green -> Refactor for every task and final verification, driving the SAME core state machine', async () => {
    const fixture = await buildOrchestrationFixture();
    const gateway = gatewayFor(fixture, workingAgent());

    const res = await runFeatureOrchestration({
      projectRoot: fixture.root,
      featureId: fixture.featureId,
      gateway,
      providerId: 'mock',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const report = res.value;

    // The run completed with passing final verification.
    expect(report.status).toBe('completed');
    expect(report.verification?.status).toBe('passed');
    expect(report.runId).toBe('RUN-001');
    expect(report.worktreePath).toBe(path.join(fixture.root, '.ai-kit', 'worktrees', 'RUN-001'));

    // Every task completed.
    expect(report.tasks.map((t) => [t.taskId, t.completed])).toEqual([
      ['TASK-001', true],
      ['TASK-002', true],
    ]);

    // Exactly one agent execution per task per phase, all completed, all
    // linked to the workflow identity.
    expect(report.executions.map((e) => [e.taskId, e.phase, e.outcome])).toEqual([
      ['TASK-001', 'red', 'completed'],
      ['TASK-001', 'green', 'completed'],
      ['TASK-001', 'refactor', 'completed'],
      ['TASK-002', 'red', 'completed'],
      ['TASK-002', 'green', 'completed'],
      ['TASK-002', 'refactor', 'completed'],
    ]);
    for (const e of report.executions) {
      expect(e.executionId).toMatch(/^exec-RUN-001-TASK-00[12]-(red|green|refactor)-1$/);
    }

    // NO DUPLICATED WORKFLOW LOGIC: the evidence lives in the worktree's
    // feature-run store — the exact file Mode 2 writes via the same core
    // functions. Every task has a complete chain; every Red record is
    // assertion-classified (the PR1/#9 gate).
    const runStatePath = featureRunPath(report.worktreePath, fixture.featureId);
    expect(await fs.readFile(runStatePath, 'utf8')).toContain('"schemaVersion": 2');
    const runState = await getFeatureRunState(report.worktreePath, fixture.featureId);
    expect(runState.ok).toBe(true);
    if (runState.ok) {
      for (const task of Object.values(runState.value.tasks)) {
        expect(task.phase).toBe('completed');
        const red = task.records.find((r) => r.phase === 'red' && r.status === 'failed');
        expect(red?.verification?.classification).toBe('assertion');
        const passes = task.records.filter((r) => r.status === 'passed');
        expect(passes.map((r) => r.phase)).toEqual(['green', 'refactor']);
      }
    }

    // The agent's edits (markers) live in the WORKTREE, not the main tree.
    for (const taskId of fixture.taskIds) {
      await expect(fs.access(markerPath(report.worktreePath, taskId))).resolves.toBeUndefined();
      await expect(fs.access(markerPath(fixture.root, taskId))).rejects.toThrow();
    }

    // Every execution is durably recorded with its frozen request, policy
    // snapshot, accepted events, and echoed policyHash.
    const executions = await gateway.listExecutions();
    expect(executions).toHaveLength(6);
    for (const record of executions) {
      expect(record.status).toBe('completed');
      expect(record.events.length).toBeGreaterThan(0);
      expect(record.policySnapshot.permissions.writablePaths).toEqual([report.worktreePath]);
      for (const event of record.events) {
        expect(event.policyHash).toBe(record.policyHash);
      }
    }

    // The orchestration state links feature, run, workspace, executions.
    const orchestration = JSON.parse(
      await fs.readFile(
        path.join(fixture.root, '.ai-kit', 'state', 'orchestrations', 'FEATURE-001.json'),
        'utf8',
      ),
    );
    expect(orchestration.status).toBe('completed');
    expect(orchestration.runId).toBe('RUN-001');
    expect(orchestration.workspace.branch).toBe('kit/RUN-001');
    expect(orchestration.executions).toHaveLength(6);
  });

  it('produces a clean diff on the worktree branch (baseCommitSha is derivable truth)', async () => {
    const fixture = await buildOrchestrationFixture();
    const gateway = gatewayFor(fixture, workingAgent());
    const res = await runFeatureOrchestration({
      projectRoot: fixture.root,
      featureId: fixture.featureId,
      gateway,
      providerId: 'mock',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Untracked markers are the agent's whole footprint on the branch.
    const status = await exec('git', ['status', '--porcelain'], { cwd: res.value.worktreePath });
    expect(status.stdout.split('\n').filter(Boolean).sort()).toEqual([
      '?? .done-TASK-001',
      '?? .done-TASK-002',
    ]);
  });
});

describe('orchestration honest failures', () => {
  it('fails with AGENT_PROVIDER_NOT_CONFIGURED before touching the filesystem', async () => {
    const fixture = await buildOrchestrationFixture();
    const gateway = new AgentGateway({ providers: [], projectRoot: fixture.root });
    const res = await runFeatureOrchestration({
      projectRoot: fixture.root,
      featureId: fixture.featureId,
      gateway,
      providerId: 'mock',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('AGENT_PROVIDER_NOT_CONFIGURED');
      expect(res.error.message).toContain('will not fall back');
    }
    // Nothing was created: no worktree, no orchestration state.
    expect(await fs.access(path.join(fixture.root, '.ai-kit', 'worktrees')).catch(() => 'missing')).toBe('missing');
    expect(
      await fs
        .access(path.join(fixture.root, '.ai-kit', 'state', 'orchestrations'))
        .catch(() => 'missing'),
    ).toBe('missing');
  });

  it('stops at the first failed agent execution and never advances the phase', async () => {
    const fixture = await buildOrchestrationFixture();
    const agent = new MockAgentProvider({ status: 'failed' });
    const gateway = gatewayFor(fixture, agent);
    const res = await runFeatureOrchestration({
      projectRoot: fixture.root,
      featureId: fixture.featureId,
      gateway,
      providerId: 'mock',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe('failed');
    expect(res.value.executions).toHaveLength(1);
    expect(res.value.executions[0]?.outcome).toBe('failed');
    // The task never left red, and no evidence was recorded.
    const runState = await getFeatureRunState(res.value.worktreePath, fixture.featureId);
    expect(runState.ok && runState.value.tasks['TASK-001']?.phase).toBe('red');
    expect(runState.ok && runState.value.tasks['TASK-001']?.records).toHaveLength(0);
  });

  it('rejects a lying agent: completed claim, no evidence (the gate is the authority)', async () => {
    const fixture = await buildOrchestrationFixture();
    // The agent "completes" every execution but never implements anything.
    const liar = new MockAgentProvider();
    const gateway = gatewayFor(fixture, liar);
    const res = await runFeatureOrchestration({
      projectRoot: fixture.root,
      featureId: fixture.featureId,
      gateway,
      providerId: 'mock',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Red passes honestly (the test fails for the right reason), then the
    // agent claims green without implementing: runTddPhase's verification
    // fails, the phase gate rejects, the orchestration stops.
    expect(res.value.status).toBe('phase_gate_rejected');
    expect(res.value.message).toContain('evidence gate rejected');
    expect(res.value.executions.map((e) => e.phase)).toEqual(['red', 'green']);
    const runState = await getFeatureRunState(res.value.worktreePath, fixture.featureId);
    // TASK-001 is stuck in green with one red record and one failed green attempt.
    expect(runState.ok && runState.value.tasks['TASK-001']?.phase).toBe('green');
    if (runState.ok) {
      const records = runState.value.tasks['TASK-001']?.records ?? [];
      expect(records.map((r) => `${r.phase}:${r.status}`)).toEqual(['red:failed', 'green:failed']);
    }
  });

  it('reports needs_approval as a blocked outcome (never silent)', async () => {
    const fixture = await buildOrchestrationFixture();
    const agent = new MockAgentProvider({ status: 'needs_approval' });
    const gateway = gatewayFor(fixture, agent);
    const res = await runFeatureOrchestration({
      projectRoot: fixture.root,
      featureId: fixture.featureId,
      gateway,
      providerId: 'mock',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.status).toBe('needs_approval');
  });
});

describe('cancellation and resumable state', () => {
  it('cancels an in-flight execution on abort and resumes from the pending phase on the next invocation', async () => {
    const fixture = await buildOrchestrationFixture();

    // First invocation: a slow agent gets cancelled mid-execution. The
    // abort is triggered from onProgress (after the orchestrator has
    // recorded the execution and dispatched it to the gateway) rather than
    // a wall-clock timer: on macOS, `git worktree add` + run-state setup
    // exceeds a 100ms timer, so the abort landed before the first execution
    // was recorded and `executions` came back empty. Triggering from
    // onProgress makes the cancellation deterministic across OSes.
    const slowAgent = new MockAgentProvider({
      delayMs: 5_000,
      performWork: async (request) => {
        if (request.instructions.includes('Phase: green')) {
          await fs.writeFile(markerPath(request.workspace.rootPath, request.taskId), 'implemented\n');
        }
      },
    });
    const controller = new AbortController();
    let dispatchedFirstExecution = false;
    const first = await runFeatureOrchestration({
      projectRoot: fixture.root,
      featureId: fixture.featureId,
      gateway: gatewayFor(fixture, slowAgent),
      providerId: 'mock',
      signal: controller.signal,
      onProgress: (line) => {
        if (!dispatchedFirstExecution && line.includes('agent execution')) {
          dispatchedFirstExecution = true;
          // Defer one tick so the gateway's start() await is in flight
          // (the 5s delay) before the abort propagates — mid-execution.
          setImmediate(() => controller.abort());
        }
      },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.status).toBe('cancelled');
    expect(first.value.executions).toHaveLength(1);
    expect(first.value.executions[0]?.outcome).toBe('cancelled');

    // The worktree survived with its run state (red attempt was NOT yet
    // recorded — the cancelled execution never reached the gate).
    const worktreePath = first.value.worktreePath;

    // Second invocation: a NEW gateway (fresh process) and a working agent
    // resume from the first pending phase and complete the feature.
    const second = await runFeatureOrchestration({
      projectRoot: fixture.root,
      featureId: fixture.featureId,
      gateway: gatewayFor(fixture, workingAgent()),
      providerId: 'mock',
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.status).toBe('completed');
    expect(second.value.worktreePath).toBe(worktreePath); // same workspace reused
    // The second invocation's report carries the FULL execution history
    // (the cancelled attempt is durable evidence, not erased): the
    // cancelled red was attempt 1; the resumed red is attempt 2.
    expect(second.value.executions.map((e) => e.executionId)).toEqual([
      'exec-RUN-001-TASK-001-red-1',
      'exec-RUN-001-TASK-001-red-2',
      'exec-RUN-001-TASK-001-green-1',
      'exec-RUN-001-TASK-001-refactor-1',
      'exec-RUN-001-TASK-002-red-1',
      'exec-RUN-001-TASK-002-green-1',
      'exec-RUN-001-TASK-002-refactor-1',
    ]);
    expect(second.value.executions[0]?.outcome).toBe('cancelled');
    expect(second.value.executions[1]?.outcome).toBe('completed');
  });

  it('refuses to re-run a completed orchestration (evidence is not discardable)', async () => {
    const fixture = await buildOrchestrationFixture();
    const gateway = gatewayFor(fixture, workingAgent());
    const first = await runFeatureOrchestration({
      projectRoot: fixture.root,
      featureId: fixture.featureId,
      gateway,
      providerId: 'mock',
    });
    expect(first.ok).toBe(true);
    const again = await runFeatureOrchestration({
      projectRoot: fixture.root,
      featureId: fixture.featureId,
      gateway: gatewayFor(fixture, workingAgent()),
      providerId: 'mock',
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.message).toContain('already completed');
  });
});

describe('PR3: the next attempt is told why the gate rejected the last one (item 1)', () => {
  // A check that fails to compile, not at an assertion: the Red gate rejects it.
  const COMPILE_ERROR_CHECK = [
    "console.error(\"src/TASK-001.ts:1:1 - error TS2304: Cannot find name 'missing'.\");",
    'process.exit(1);',
    '',
  ].join('\n');

  it('carries the classified rejection into the next execution', async () => {
    const fixture = await buildOrchestrationFixture();
    const instructions: string[] = [];
    const provider = new MockAgentProvider({
      performWork: async (request) => {
        instructions.push(request.instructions);
        if (instructions.length === 1) {
          await fs.writeFile(path.join(request.workspace.rootPath, 'check.js'), COMPILE_ERROR_CHECK);
        }
      },
    });
    const gateway = gatewayFor(fixture, provider);
    const run = () =>
      runFeatureOrchestration({
        projectRoot: fixture.root,
        featureId: fixture.featureId,
        gateway,
        providerId: 'mock',
      });

    await run();
    await run();

    expect(instructions).toHaveLength(2);
    expect(instructions[0]).not.toMatch(/Previous attempt/);
    expect(instructions[1]).toMatch(
      /Previous attempt 1 of 3 was rejected by the evidence gate \(classification: compilation\)/,
    );
  }, 60_000);
});
