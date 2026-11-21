// packages/cli/src/application/agent/providers/claude-code/provider.test.ts
//
// ClaudeCodeProvider tests (ADR-0019 PR4). A fake `claude` CLI fixture
// drives the REAL provider code path — spawn, live stream parsing, event
// emission, argv derivation, settlement — with no real binary and no
// network. The cross-process resume test goes through the REAL gateway so
// the persisted execution record, the encrypted session store, and the
// fresh-process resume are all exercised end to end.
//
// The acceptance criterion for PR4 ("a real provider executes a bounded
// task without bypassing the approved policy") has two halves: the
// policy-bypass half is proven HERE deterministically (argv + parity), and
// the real-provider half is proven by claude-code-smoke.test.ts when the
// claude CLI is available (visible skip otherwise).

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_POLICY_SNAPSHOT_SCHEMA_VERSION,
  AGENT_CAPABILITIES,
  computePolicyHash,
  type AgentExecutionRequest,
  type AgentPolicySnapshot,
  type AgentProviderCapabilities,
} from '@agentic-sdlc-kit/contracts';
import { AgentGateway } from '../../gateway.js';
import { ClaudeCodeProvider } from './provider.js';
import { loadSessionRecord } from './resume-store.js';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'fake-claude.mjs',
);

let projectRoot: string;
let workspaceRoot: string;
let argvFile: string;

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-claude-provider-'));
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-claude-ws-'));
  argvFile = path.join(projectRoot, 'argv.json');
});

afterEach(async () => {
  await fs.rm(projectRoot, { recursive: true, force: true });
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

function provider(mode: string, extra: Record<string, string> = {}): ClaudeCodeProvider {
  return new ClaudeCodeProvider({
    projectRoot,
    cliPath: process.execPath,
    cliArgvPrefix: [FIXTURE],
    env: { FAKE_CLAUDE_MODE: mode, FAKE_CLAUDE_ARGV_FILE: argvFile, ...extra },
  });
}

function snapshot(request: AgentExecutionRequest): AgentPolicySnapshot {
  return {
    schemaVersion: AGENT_POLICY_SNAPSHOT_SCHEMA_VERSION,
    permissions: request.permissions,
    budget: request.budget,
    approvalPolicy: request.approvalPolicy,
  };
}

function request(overrides: Partial<AgentExecutionRequest> = {}): AgentExecutionRequest {
  const base: AgentExecutionRequest = {
    schemaVersion: 2,
    executionId: 'exec-RUN-001-TASK-001-red-1',
    workflowRunId: 'RUN-001',
    taskId: 'TASK-001',
    providerId: 'claude-code',
    taskKind: 'test_authoring',
    policyHash: 'sha256:test-policy',
    workspace: {
      id: 'ws-run-001',
      kind: 'git-worktree',
      rootPath: workspaceRoot,
      branch: 'kit/RUN-001',
      baseCommitSha: 'a'.repeat(40),
      createdAt: new Date().toISOString(),
    },
    instructions: 'Write the failing test for TASK-001.',
    context: { specificationRef: 'docs/spec', planRef: 'docs/plan', relevantFiles: [], constraints: [] },
    permissions: {
      capabilities: ['repository.read', 'repository.write', 'process.test'],
      writablePaths: [workspaceRoot],
      networkAllowed: false,
    },
    budget: { maxDurationMs: 60_000, maxToolCalls: 40 },
    approvalPolicy: { requireApprovalFor: ['external.approval'], allowAutonomousExecution: true },
    ...overrides,
  };
  base.policyHash = computePolicyHash(snapshot(base));
  return base;
}

async function readArgv(): Promise<{ argv: string[]; cwd: string; mode: string } | undefined> {
  try {
    return JSON.parse(await fs.readFile(argvFile, 'utf8')) as { argv: string[]; cwd: string; mode: string };
  } catch {
    return undefined;
  }
}

describe('ClaudeCodeProvider — happy path', () => {
  it('completes, reports honest usage, and never fabricates artifacts', async () => {
    const req = request();
    const handle = await provider('happy').start(req, new AbortController().signal);
    const result = await handle.result();

    expect(result.status).toBe('completed');
    expect(result.summary).toContain('Done: created the marker file.');
    expect(result.proposedArtifacts).toEqual([]); // claims are not evidence
    expect(result.usage?.inputTokens).toBe(10);
    expect(result.usage?.outputTokens).toBe(20);
    expect(result.usage?.estimatedCost).toBe(0.003);
    expect(result.usage?.currency).toBe('USD');
    expect(result.usage?.durationMs).toBe(12);
    expect(result.session?.sessionId).toBe('sess-fake-001');
    expect(result.session?.resumeToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it('streams live events with monotonic sequences and the echoed policyHash', async () => {
    const req = request();
    const handle = await provider('happy').start(req, new AbortController().signal);
    const events: unknown[] = [];
    const unsubscribe = handle.events((e) => events.push(e));
    const result = await handle.result();
    unsubscribe();

    // Late subscription replays the full stream (same contract as the mock).
    const replayed: unknown[] = [];
    handle.events((e) => replayed.push(e));
    expect(replayed.length).toBe(events.length);

    const types = events.map((e) => (e as { type: string }).type);
    expect(types).toContain('execution.started');
    expect(types).toContain('message.delta');
    expect(types).toContain('execution.completed');
    const requested = events.find((e) => (e as { type: string }).type === 'tool.requested') as {
      toolCallId: string;
      capability: string;
    };
    expect(requested.toolCallId).toBe('toolu_1');
    expect(requested.capability).toBe('repository.write'); // inferred from the SAME table
    const sequences = events.map((e) => (e as { sequence: number }).sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    for (const e of events) {
      expect((e as { policyHash: string }).policyHash).toBe(req.policyHash);
      expect((e as { executionId: string }).executionId).toBe(req.executionId);
    }
    const completed = events.find((e) => (e as { type: string }).type === 'execution.completed') as {
      status: string;
    };
    expect(completed.status).toBe(result.status);
  });

  it('builds the headless argv from the policy: scoped writes, allowlisted Bash, no bypass', async () => {
    const req = request();
    const handle = await provider('happy').start(req, new AbortController().signal);
    await handle.result();

    const captured = await readArgv();
    expect(captured, 'fixture never wrote its argv').toBeDefined();
    // macOS resolves /var -> /private/var in a child's process.cwd(), so
    // compare REAL paths on both sides (identity on Linux).
    expect(captured?.cwd).toBe(await fs.realpath(workspaceRoot));
    expect(captured?.argv[0]).toBe('-p');
    expect(captured?.argv[2]).toBe('--output-format');
    expect(captured?.argv[3]).toBe('stream-json');
    expect(captured?.argv).toContain('--verbose');
    expect(captured?.argv).toContain('--permission-mode');
    expect(captured?.argv).toContain('default');
    const flat = captured?.argv.join(' ') ?? '';
    expect(flat).toContain(`Write(${workspaceRoot}/**)`);
    expect(flat).toContain('Bash(pnpm test:*)');
    expect(captured?.argv).toContain('--max-turns');
    expect(captured?.argv).toContain('40');
    const disallowed = flat.slice(flat.indexOf('--disallowedTools') + '--disallowedTools'.length).split(' --')[0];
    expect(disallowed).toContain('Task');
    expect(disallowed).toContain('WebFetch');
    expect(disallowed).toContain('WebSearch');
    expect(flat).not.toContain('bypassPermissions');
    expect(flat).not.toContain('--dangerously-skip-permissions');
  });

  it('links runtime Mods into the workspace (parity) and reports honestly', async () => {
    const handle = await provider('happy').start(request(), new AbortController().signal);
    const result = await handle.result();
    // Either the Mods linked (note says active) or they are honestly absent.
    expect(result.summary).toMatch(/runtime Mods (active|NOT fully active)/);
  });
});

describe('ClaudeCodeProvider — honest statuses (values, never completed)', () => {
  it('already-aborted signal: cancelled without spawning', async () => {
    const controller = new AbortController();
    controller.abort();
    const handle = await provider('happy').start(request(), controller.signal);
    const result = await handle.result();
    expect(result.status).toBe('cancelled');
    expect(result.errors[0]?.code).toBe('CANCELLED');
    expect(await readArgv()).toBeUndefined(); // never spawned
  });

  it('approval policy blocks autonomous runs that require approval, before spawning', async () => {
    const req = request({
      permissions: {
        capabilities: ['repository.read', 'repository.write'],
        writablePaths: [workspaceRoot],
        networkAllowed: false,
      },
      approvalPolicy: { requireApprovalFor: ['repository.write'], allowAutonomousExecution: false },
    });
    const handle = await provider('happy').start(req, new AbortController().signal);
    const result = await handle.result();
    expect(result.status).toBe('needs_approval');
    expect(result.errors[0]?.code).toBe('APPROVAL_REQUIRED');
    expect(await readArgv()).toBeUndefined(); // blocked BEFORE touching the provider
  });

  it('mid-execution cancellation resolves a cancelled value, never a rejection', async () => {
    const controller = new AbortController();
    const handle = await provider('sleep').start(request(), controller.signal);
    let abortAfterStart = false;
    handle.events((e) => {
      if ((e as { type: string }).type === 'execution.started' && !abortAfterStart) {
        abortAfterStart = true;
        setImmediate(() => controller.abort());
      }
    });
    const result = await handle.result();
    expect(result.status).toBe('cancelled');
    expect(result.errors[0]?.code).toBe('CANCELLED');
  });

  it('max-turns breach maps to failed + BUDGET_EXCEEDED', async () => {
    const handle = await provider('maxturns').start(request(), new AbortController().signal);
    const result = await handle.result();
    expect(result.status).toBe('failed');
    expect(result.errors[0]?.code).toBe('BUDGET_EXCEEDED');
  });

  it('execution errors map to failed + PROVIDER_INTERNAL', async () => {
    const handle = await provider('error').start(request(), new AbortController().signal);
    const result = await handle.result();
    expect(result.status).toBe('failed');
    expect(result.errors[0]?.code).toBe('PROVIDER_INTERNAL');
  });

  it('permission denials map to failed + CAPABILITY_DENIED', async () => {
    const handle = await provider('denied').start(request(), new AbortController().signal);
    const result = await handle.result();
    expect(result.status).toBe('failed');
    expect(result.errors[0]?.code).toBe('CAPABILITY_DENIED');
  });

  it('a killed process (signal, no result) maps to interrupted', async () => {
    const handle = await provider('signal').start(request(), new AbortController().signal);
    const result = await handle.result();
    expect(result.status).toBe('interrupted');
  });

  it('exit 0 without a result object (contract violation) maps to interrupted', async () => {
    const handle = await provider('noresult').start(request(), new AbortController().signal);
    const result = await handle.result();
    expect(result.status).toBe('interrupted');
  });

  it('a non-zero exit without a result maps to failed (honest, never completed)', async () => {
    const handle = await provider('crash').start(request(), new AbortController().signal);
    const result = await handle.result();
    expect(['failed', 'interrupted']).toContain(result.status);
    expect(result.status).not.toBe('completed');
  });

  it('output bound breach kills the process and reports BUDGET_EXCEEDED', async () => {
    const p = new ClaudeCodeProvider({
      projectRoot,
      cliPath: process.execPath,
      cliArgvPrefix: [FIXTURE],
      maxOutputBytes: 4_096,
      env: { FAKE_CLAUDE_MODE: 'flood', FAKE_CLAUDE_ARGV_FILE: argvFile },
    });
    const handle = await p.start(request(), new AbortController().signal);
    const result = await handle.result();
    expect(result.status).toBe('failed');
    expect(result.errors[0]?.code).toBe('BUDGET_EXCEEDED');
  });
});

describe('ClaudeCodeProvider — capabilities and health', () => {
  it('declares honest budget enforcement levels (revision C)', async () => {
    const caps: AgentProviderCapabilities = await provider('happy').capabilities();
    expect([...caps.capabilities].sort()).toEqual([...AGENT_CAPABILITIES].sort());
    expect(caps.budgetEnforcement.maxDurationMs).toBe('gateway-enforced');
    expect(caps.budgetEnforcement.maxToolCalls).toBe('gateway-enforced');
    expect(caps.budgetEnforcement.maxInputTokens).toBe('best-effort');
    expect(caps.budgetEnforcement.maxTotalTokens).toBe('best-effort');
    expect(caps.budgetEnforcement.maxEstimatedCost).toBe('best-effort');
  });

  it('healthCheck reports a missing binary honestly', async () => {
    const missing = new ClaudeCodeProvider({
      projectRoot,
      cliPath: path.join(projectRoot, 'definitely-not-claude'),
    });
    const health = await missing.healthCheck();
    expect(health.available).toBe(false);
    expect(health.message).toContain('not found');
    expect(health.message).toContain('install Claude Code');
  });

  it('healthCheck succeeds against the fixture binary', async () => {
    const health = await provider('happy').healthCheck();
    expect(health.available).toBe(true);
  });
});

describe('ClaudeCodeProvider — cross-process resume (PR4 deferred item)', () => {
  it('resumes through a FRESH gateway using the encrypted store, and the token never lands in plaintext', async () => {
    const req = request({ executionId: 'exec-RUN-005-TASK-001-red-1' });
    const firstGateway = new AgentGateway({ providers: [provider('happy')], projectRoot });
    const first = await firstGateway.start(req, { policySnapshot: snapshot(req) });
    expect(first.ok, first.ok ? '' : JSON.stringify(first.error)).toBe(true);
    if (!first.ok) return;
    expect(first.value.status).toBe('completed');

    // The encrypted session record exists; the gateway's own persisted
    // execution record contains NO token.
    const record = await loadSessionRecord(projectRoot, req.executionId);
    expect(record?.sessionId).toBe('sess-fake-001');
    const persistedExecution = await fs.readFile(
      path.join(projectRoot, '.ai-kit', 'state', 'agent-executions', `${req.executionId}.json`),
      'utf8',
    );
    if (record) expect(persistedExecution).not.toContain(record.resumeToken);

    // A NEW process: fresh gateway + fresh provider. The "CLI" reads the
    // credential from the encrypted store and presents it to resume().
    const freshGateway = new AgentGateway({ providers: [provider('resume')], projectRoot });
    const resumed = await freshGateway.resume(req.executionId, record?.resumeToken ?? 'wrong');
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.value.status).toBe('completed');
    expect(resumed.value.attempts).toBe(2);

    // The resumed invocation addressed the provider session by id.
    const captured = await readArgv();
    expect(captured?.argv).toContain('--resume');
    expect(captured?.argv).toContain('sess-fake-001');
  });

  it('a wrong resume token fails closed with SESSION_EXPIRED', async () => {
    const req = request({ executionId: 'exec-RUN-006-TASK-001-red-1' });
    const firstGateway = new AgentGateway({ providers: [provider('happy')], projectRoot });
    const first = await firstGateway.start(req, { policySnapshot: snapshot(req) });
    expect(first.ok, first.ok ? '' : JSON.stringify(first.error)).toBe(true);

    const freshGateway = new AgentGateway({ providers: [provider('resume')], projectRoot });
    const resumed = await freshGateway.resume(req.executionId, 'forged-token');
    expect(resumed.ok, resumed.ok ? '' : JSON.stringify(resumed.error)).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.value.status).toBe('failed');
    expect(resumed.value.result?.errors[0]?.code).toBe('SESSION_EXPIRED');
  });

  it('cancel() of an unknown executionId is a no-op', async () => {
    await expect(provider('happy').cancel('exec-never-started')).resolves.toBeUndefined();
  });
});
