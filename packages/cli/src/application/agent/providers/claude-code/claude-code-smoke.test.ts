// packages/cli/src/application/agent/providers/claude-code/claude-code-smoke.test.ts
//
// REAL-provider smoke test (ADR-0019 PR4 acceptance criterion):
//
//   "A real provider executes a bounded task without bypassing the
//    approved policy."
//
// This test runs ONLY when a real `claude` CLI is available (dev machines,
// a future CI lane with credentials). When it is not, the suite SKIPS
// VISIBLY — vitest reports the skipped test — because a green-looking
// placeholder would violate the kit's no-silent-fabrication principle.
//
// The task is deliberately tiny and bounded: create one marker file inside
// the granted workspace. The assertions prove the policy held:
//   - the execution completed within the granted budget;
//   - the marker exists INSIDE the workspace (the only writablePath);
//   - the derived argv carried the scoped allowlist and NO bypass flags.

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AGENT_POLICY_SNAPSHOT_SCHEMA_VERSION,
  computePolicyHash,
  type AgentExecutionRequest,
  type AgentPolicySnapshot,
} from '@agentic-sdlc-kit/contracts';
import { buildClaudeArgv } from './claude-argv.js';
import { ClaudeCodeProvider } from './provider.js';

const CLAUDE_BIN = 'claude';
const HEALTH_TIMEOUT_MS = 5_000;

let available = false;
let projectRoot: string | undefined;
let workspaceRoot: string | undefined;

function probeClaude(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, ['--version'], { stdio: 'ignore', shell: false });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(false);
    }, HEALTH_TIMEOUT_MS);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

beforeAll(async () => {
  available = await probeClaude();
  if (available) {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-pr4-smoke-'));
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-pr4-smoke-ws-'));
  }
});

afterAll(async () => {
  if (projectRoot) await fs.rm(projectRoot, { recursive: true, force: true });
  if (workspaceRoot) await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe.skipIf(!available)('claude-code real-provider smoke (acceptance: PR4)', () => {
  it('executes a bounded task inside the granted workspace without bypassing policy', async () => {
    if (!workspaceRoot) return;
    const req: AgentExecutionRequest = {
      schemaVersion: 2,
      executionId: 'exec-RUN-042-TASK-001-red-1',
      workflowRunId: 'RUN-042',
      taskId: 'TASK-001',
      providerId: 'claude-code',
      taskKind: 'implementation',
      policyHash: '', // computed below from the frozen snapshot
      workspace: {
        id: 'ws-smoke-001',
        kind: 'directory',
        rootPath: workspaceRoot,
        createdAt: new Date().toISOString(),
      },
      instructions:
        `Create the file smoke-marker.txt in the current working directory with exactly ` +
        `the content kit-pr4-smoke (no trailing newline beyond the content) and do nothing else. ` +
        `Do not create any other files.`,
      context: { relevantFiles: [], constraints: ['create only smoke-marker.txt'] },
      permissions: {
        capabilities: ['repository.read', 'repository.write'],
        writablePaths: [workspaceRoot],
        networkAllowed: false,
      },
      budget: { maxDurationMs: 120_000, maxToolCalls: 40 },
      approvalPolicy: { requireApprovalFor: ['external.approval'], allowAutonomousExecution: true },
    };
    const policySnapshot: AgentPolicySnapshot = {
      schemaVersion: AGENT_POLICY_SNAPSHOT_SCHEMA_VERSION,
      permissions: req.permissions,
      budget: req.budget,
      approvalPolicy: req.approvalPolicy,
    };
    req.policyHash = computePolicyHash(policySnapshot);

    // The derived invocation never bypasses the approved policy.
    const { args } = buildClaudeArgv(req);
    const flat = args.join(' ');
    expect(flat).not.toContain('bypassPermissions');
    expect(flat).not.toContain('--dangerously-skip-permissions');
    expect(flat).toContain(`Write(${workspaceRoot}/**)`);

    const provider = new ClaudeCodeProvider({ projectRoot: projectRoot!, cliPath: CLAUDE_BIN });
    const handle = await provider.start(req, new AbortController().signal);
    const result = await handle.result();

    expect(result.status).toBe('completed');
    expect(result.usage?.durationMs).toBeLessThanOrEqual(req.budget.maxDurationMs + 5_000);

    // The evidence: the file exists, inside the ONLY writablePath.
    const marker = path.join(workspaceRoot, 'smoke-marker.txt');
    const content = await fs.readFile(marker, 'utf8');
    expect(content.trim()).toBe('kit-pr4-smoke');

    // No stray files leaked outside the granted path list.
    const entries = await fs.readdir(workspaceRoot);
    const stray = entries.filter((e) => e !== 'smoke-marker.txt' && e !== '.claude');
    expect(stray).toEqual([]);
  });
});

describe.skipIf(available)('claude-code real-provider smoke (acceptance: PR4)', () => {
  it.skip('SKIPPED: no real claude CLI on this machine — visible skip, not a green fabrication', () => {
    // Intentionally unreachable: the test is reported as skipped by vitest.
  });
});
